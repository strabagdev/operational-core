import { requireApiContractAccess } from "./api-auth";
import { apiError } from "./api-response";
import { buildOfflineManifest, OfflineManifestError, offlineManifestHash } from "./offline-manifest";
import { withPrismaReadSnapshot } from "./prisma";

export const REVISION_BOUND_READ_VERSION = 1;
export type RevisionReadKind = "entities" | "definition" | "records" | "record" | "views" | "attendance" | "state-update" | "panel" | "report";
export type RevisionReadResource = { kind: RevisionReadKind; contractId:string; entityTypeId?:string; appViewId?:string; recordId?:string };
const parameters: Record<RevisionReadKind, string[]> = {
  entities: [], definition: [], record: [], views: [],
  records: ["page", "pageSize", "search", "sort", "direction", "fieldIdHasValue"],
  attendance: ["daySnapshotVersion", "page", "pageSize", "date", "personRecordId", "search", "searchFieldId", "searchComparisonVersion"],
  "state-update": ["date", "page", "pageSize", "search", "searchFieldId", "searchComparisonVersion", "subjectRecordId", "identity", "currentBatchVersion", "currentBatchFingerprint", "subjectRecordIds"],
  panel: ["datasetId", "filters", "page", "pageSize", "search"],
  report: ["from", "to", "search"],
};
const protocolParameters = ["readRevisionVersion", "expectedReadRevision"];
export class RevisionReadError extends Error {
  constructor(public code:string, public status:number, message:string) { super(message); }
}
export function parseRevisionReadRequest(search:URLSearchParams, kind:RevisionReadKind) {
  if (kind === "attendance" && search.has("daySnapshotVersion") && search.get("readRevisionVersion") !== "1") throw new RevisionReadError("READ_REVISION_REQUIRED",409,"La descarga del día requiere una revisión consistente.");
  if (!search.has("readRevisionVersion") && !search.has("expectedReadRevision")) return null;
  if (search.get("readRevisionVersion") !== "1") throw new RevisionReadError("READ_REVISION_VERSION_UNSUPPORTED",400,"La revisión de lectura solicitada no es compatible.");
  for (const key of search.keys()) {
    if (![...parameters[kind],...protocolParameters].includes(key) || (search.getAll(key).length > 1 && !(key === "subjectRecordIds" && kind === "state-update"))) {
      throw new RevisionReadError("INVALID_READ_REVISION_QUERY",400,"La selección de lectura no es válida.");
    }
  }
  const expected=search.get("expectedReadRevision");
  if (expected !== null && !/^[a-f0-9]{64}$/.test(expected)) throw new RevisionReadError("INVALID_READ_REVISION",400,"La revisión anterior no es válida.");
  const page=search.get("page");
  if (page !== null && (!/^[1-9]\d*$/.test(page) || !Number.isSafeInteger(Number(page)))) throw new RevisionReadError("INVALID_READ_REVISION_PAGE",400,"La página no es válida.");
  if (page && Number(page)>1 && !expected) throw new RevisionReadError("READ_REVISION_REQUIRED",409,"La siguiente página requiere la revisión de la lectura anterior.");
  const entries=[...search.entries()].filter(([key])=>!protocolParameters.includes(key)).sort(([ak],[bk])=>ak<bk?-1:ak>bk?1:0);
  // Batches select different subjects from the same dataset; each response also binds the exact IDs.
  const selection=entries.filter(([key])=>key!=="page" && !(kind==="state-update" && key==="subjectRecordIds"));
  return { expected, entries, selection };
}

/** All Prisma consumers in the legacy reader share one explicit read-only snapshot. */
export async function revisionBoundRead(request:Request, resource:RevisionReadResource, read:()=>Promise<Response>):Promise<Response> {
  const headers={"Cache-Control":"no-store"};
  const started=performance.now();
  try {
    const query=parseRevisionReadRequest(new URL(request.url).searchParams,resource.kind);
    if (!query) return read();
    return await withPrismaReadSnapshot(async tx=>{
      const access=await requireApiContractAccess(request,resource.contractId);
      if (!access.ok) { access.response.headers.set("Cache-Control","no-store"); return access.response; }
      const response=await read();
      if (!response.ok) { response.headers.set("Cache-Control","no-store"); return response; }
      const envelope=await response.json();
      if (envelope?.ok!==true || !envelope.data || typeof envelope.data!=="object") throw new RevisionReadError("READ_REVISION_UNAVAILABLE",503,"No se pudo acreditar la lectura.");
      const data=envelope.data;
      const effectiveContext={date:typeof data.date==="string"?data.date:null,from:typeof data.from==="string"?data.from:null,to:typeof data.to==="string"?data.to:null};
      const manifest=await buildOfflineManifest(tx,{appId:access.context.app.id,userId:access.context.user.id,contractId:resource.contractId},
        {version:1,appViewIds:resource.appViewId?[resource.appViewId]:[],...(effectiveContext.date?{date:effectiveContext.date}:{})},
        {entityTypeIds:resource.entityTypeId?[resource.entityTypeId]:[],allEntities:resource.kind==="entities"});
      if (!manifest.readBindingVector.available || manifest.tracking.databaseDml!=="installed" || !manifest.tracking.dependenciesResolved || manifest.entities.some(entity=>!entity.active||!entity.tracked)) {
        throw new RevisionReadError("READ_REVISION_DEPENDENCIES_UNAVAILABLE",503,"No se pudo acreditar la revisión de todas las dependencias.");
      }
      if (!["entities","definition","views"].includes(resource.kind)) {
        // Normal writers reject these links, but historical/administrative SQL must not let
        // foreign label changes escape the vector of the authorized contract.
        const [links]=await tx.$queryRaw<Array<{invalid:boolean}>>`
          SELECT EXISTS (
            SELECT 1 FROM "EntityRelation" link
            JOIN "EntityRecord" source ON source.id=link."sourceRecordId"
            JOIN "EntityType" source_type ON source_type.id=source."entityTypeId"
            JOIN "EntityRecord" target ON target.id=link."targetRecordId"
            JOIN "EntityType" target_type ON target_type.id=target."entityTypeId"
            WHERE source_type."contractId"=${resource.contractId} AND target_type."contractId"<>${resource.contractId}
          ) AS invalid`;
        if (links.invalid) throw new RevisionReadError("READ_REVISION_DEPENDENCIES_UNAVAILABLE",503,"No se pudo acreditar el alcance de las relaciones.");
      }
      const selectionFingerprint=offlineManifestHash({resource,query:query.selection,effectiveContext});
      const revision=offlineManifestHash({manifestVectorRevision:manifest.readBindingVector.revision,selectionFingerprint,representationVersion:1});
      if (query.expected && query.expected!==revision) throw new RevisionReadError("READ_REVISION_CHANGED",409,"Los datos, permisos o la definición cambiaron. Inicia nuevamente esta lectura; conserva los datos locales disponibles.");
      const readRevision={version:1,representationVersion:1,mode:"shadow",reuseAllowed:false,clientMaySkipReads:false,
        revision,manifestVectorRevision:manifest.readBindingVector.revision,epoch:manifest.epoch,authorizationFingerprint:manifest.scope.authorizationFingerprint,
        selectionFingerprint,requestFingerprint:offlineManifestHash({resource,query:query.entries,effectiveContext}),
        contentHash:offlineManifestHash(data),snapshot:manifest.snapshot,coverageCertified:false};
      const resultHeaders=new Headers(response.headers);resultHeaders.set("Cache-Control","no-store");resultHeaders.delete("Content-Length");
      resultHeaders.append("Server-Timing",`revision-read;dur=${(performance.now()-started).toFixed(1)}`);
      return Response.json({...envelope,readRevision},{status:response.status,headers:resultHeaders});
    });
  } catch(error) {
    if (error instanceof RevisionReadError || error instanceof OfflineManifestError) return apiError({code:error.code,status:error.status,message:error.message,headers});
    // No unversioned fallback, partial certificate or automatic transaction retry.
    return apiError({code:"READ_REVISION_UNAVAILABLE",status:503,message:"No se pudo acreditar una lectura consistente. No se autoriza reutilizar datos.",headers});
  }
}
