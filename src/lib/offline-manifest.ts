import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { selectiveReuseEnabled } from "./offline-selective-reuse";
import { parseAppViewConfig } from "./app-views";
import { getRelationConfig } from "./field-validation";
import { prisma } from "./prisma";
import { readOfflineEntityRevisions, readOfflineRevisionCatalog } from "./offline-revisions";

export const OFFLINE_MANIFEST_VERSION = 1;
export const OFFLINE_NEGOTIATION_VERSIONS = Object.freeze({ readRepresentationVersion: 1, receiptVersion: 1, storagePolicyVersion: 1 } as const);
export const OFFLINE_MANIFEST_MAX_VIEWS = 100;
export const OFFLINE_MANIFEST_MAX_ENTITIES = 200;
export type OfflineManifestScope = { appId:string; userId:string; contractId:string };
type NegotiationExpectations = { scopeFingerprint?:string; manifestVectorRevision?:string; epoch?:string; definitionsRevision?:string };
type OfflineNegotiationRequest = { nonce:string; readRepresentationVersion:number; receiptVersion:number; storagePolicyVersion:number; expected:NegotiationExpectations };
export type OfflineManifestRequest = { date?:string; month?:string; appViewIds:string[] } &
  ({ version:1 } | { version:2; negotiation:OfflineNegotiationRequest });
export class OfflineManifestError extends Error {
  constructor(public readonly code:string, public readonly status:number, message:string) { super(message); }
}
/** A semantic hash: configured arrays preserve order; object property order is immaterial. */
export function offlineManifestHash(value:unknown):string {
  return createHash("sha256").update(JSON.stringify(value,(_key,item)=>typeof item === "bigint" ? item.toString() : item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])) : item)).digest("hex");
}
export function parseOfflineManifestRequest(search:URLSearchParams):OfflineManifestRequest {
  const version=search.get("version")??"1";
  const negotiationKeys=["nonce",...Object.keys(OFFLINE_NEGOTIATION_VERSIONS),"expectedScopeFingerprint","expectedManifestVectorRevision","expectedEpoch","expectedDefinitionsRevision"];
  if ([...search.keys()].some(key=>!["version","date","month","appViewId",...(version==="2"?negotiationKeys:[])].includes(key))) throw new OfflineManifestError("INVALID_OFFLINE_MANIFEST_QUERY",400,"Parámetro de manifiesto no compatible.");
  if (!["1","2"].includes(version) || ["version","date","month"].some(key=>search.getAll(key).length>1)) throw new OfflineManifestError("INVALID_OFFLINE_MANIFEST_VERSION",400,"Versión o contexto de manifiesto no compatible.");
  const date=search.get("date")??undefined,month=search.get("month")??undefined;
  if ((date && (!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+"T00:00:00Z"))||date.startsWith("0000-")||new Date(date+"T00:00:00Z").toISOString().slice(0,10)!==date)) ||
      (month&&(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month.startsWith("0000-"))) || (date&&month&&!date.startsWith(month+"-"))) throw new OfflineManifestError("INVALID_OFFLINE_MANIFEST_CONTEXT",400,"Fecha o mes no válido.");
  const ids=search.getAll("appViewId");
  if(ids.length>OFFLINE_MANIFEST_MAX_VIEWS||new Set(ids).size!==ids.length||ids.some(id=>!id||id!==id.trim()||id.length>200))throw new OfflineManifestError("INVALID_OFFLINE_MANIFEST_SCOPE",400,"Alcance de experiencias no válido.");
  const context={...(date?{date}:{}),...(month?{month}:{}),appViewIds:ids.sort()};
  if(version==="1")return {version:1,...context};
  const invalid=()=>new OfflineManifestError("INVALID_OFFLINE_NEGOTIATION",400,"La negociación de revisiones no es válida.");
  if(negotiationKeys.some(key=>search.getAll(key).length>1))throw invalid();
  const nonce=search.get("nonce");
  if(!nonce||!/^[A-Za-z0-9_-]{16,128}$/.test(nonce))throw invalid();
  const protocolVersion=(key:string)=>{
    const value=search.get(key);
    if(!value||!/^[1-9]\d{0,4}$/.test(value)||Number(value)>65535)throw invalid();
    return Number(value);
  };
  const expected:NegotiationExpectations={};
  for(const[key,property]of Object.entries({expectedScopeFingerprint:"scopeFingerprint",expectedManifestVectorRevision:"manifestVectorRevision",expectedEpoch:"epoch",expectedDefinitionsRevision:"definitionsRevision"})as Array<[string,keyof NegotiationExpectations]>){
    const value=search.get(key);
    if(value!==null){if(!(property==="epoch"?/^[A-Za-z0-9_-]{1,128}$/:/^[a-f0-9]{64}$/).test(value))throw invalid();expected[property]=value;}
  }
  return {version:2,...context,negotiation:{nonce,readRepresentationVersion:protocolVersion("readRepresentationVersion"),receiptVersion:protocolVersion("receiptVersion"),storagePolicyVersion:protocolVersion("storagePolicyVersion"),expected}};
}

/** Compatibility diagnostics only. Core cannot attest a Client's receipt or physical storage. */
function negotiateOfflineManifest(request:OfflineNegotiationRequest, bindings:Required<NegotiationExpectations>, available:boolean, requestFingerprint:string, pilot: {enabled:boolean;appViewIds:string[]}) {
  const supportedVersions={...OFFLINE_NEGOTIATION_VERSIONS,storagePolicyVersion:request.storagePolicyVersion===2?2:1};
  const issues:string[]=[];
  for(const key of Object.keys(OFFLINE_NEGOTIATION_VERSIONS)as Array<keyof typeof OFFLINE_NEGOTIATION_VERSIONS>){
    if(request[key]!==supportedVersions[key])issues.push(({readRepresentationVersion:"READ_REPRESENTATION_UNSUPPORTED",receiptVersion:"RECEIPT_VERSION_UNSUPPORTED",storagePolicyVersion:"STORAGE_POLICY_UNSUPPORTED"})[key]);
  }
  const comparison={}as Record<keyof NegotiationExpectations,"not-requested"|"match"|"mismatch">;
  for(const key of Object.keys(bindings)as Array<keyof NegotiationExpectations>){
    comparison[key]=request.expected[key]===undefined?"not-requested":request.expected[key]===bindings[key]?"match":"mismatch";
    if(comparison[key]==="mismatch")issues.push(({scopeFingerprint:"SCOPE_MISMATCH",manifestVectorRevision:"REVISION_MISMATCH",epoch:"EPOCH_MISMATCH",definitionsRevision:"DEFINITION_MISMATCH"})[key]);
  }
  if(!available)issues.push("REVISION_TRACKING_UNAVAILABLE");
  const enabled=request.storagePolicyVersion===2 && pilot.enabled && available && issues.length===0 && pilot.appViewIds.length>0;
  return {version:1 as const,nonce:request.nonce,requestFingerprint,
    status:!available?"unavailable"as const:issues.length?"incompatible"as const:"compatible"as const,
    issues,requestedVersions:{readRepresentationVersion:request.readRepresentationVersion,receiptVersion:request.receiptVersion,storagePolicyVersion:request.storagePolicyVersion},
    supportedVersions,bindings,comparison,compatibilityOnly:!enabled,
    reuseAllowed:enabled,clientMaySkipReads:enabled,coverageCertified:false as const,localReceiptVerified:false as const,storageIdentityVerified:false as const,
    ...(request.storagePolicyVersion===2?{selectiveReuse:{version:1 as const,policy:"attendance-runtime-v1" as const,enabled,appViewIds:enabled?pilot.appViewIds:[]}}:{})};
}
const entityKeys=new Set(["entityTypeId","sourceEntityTypeId","targetEntityTypeId","catalogEntityTypeId","revisionEntityTypeId","relatedEntityTypeId","catalogId"]);
function configuredEntities(value:unknown):string[] {
  if(Array.isArray(value))return value.flatMap(configuredEntities);
  if(!value||typeof value!=="object")return [];
  return Object.entries(value).flatMap(([key,item])=>entityKeys.has(key)&&typeof item==="string"?[item]:configuredEntities(item));
}
function monthDays(month:string) {
  const first=new Date(month+"-01T00:00:00Z"),end=new Date(first);end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);
  return Array.from({length:end.getUTCDate()},(_,i)=>month+"-"+String(i+1).padStart(2,"0"));
}

/** Called only after Bearer verification. Re-read the whole authorization in this same snapshot. */
export async function buildOfflineManifest(tx:Prisma.TransactionClient, scope:OfflineManifestScope, query:OfflineManifestRequest, roots: { entityTypeIds?:string[]; allEntities?:boolean } = {}) {
  const [user,app,contract]=await Promise.all([
    tx.user.findUnique({where:{id:scope.userId},select:{id:true,active:true,platformRole:true}}),
    tx.externalApp.findUnique({where:{id:scope.appId},select:{id:true,active:true,organizationId:true,clientId:true}}),
    tx.contract.findUnique({where:{id:scope.contractId},select:{id:true,status:true,organizationId:true,organization:{select:{id:true,active:true}}}}),
  ]);
  if(!user?.active||!app?.active||!contract||contract.status!=="ACTIVE"||!contract.organization.active||app.organizationId!==contract.organizationId)throw new OfflineManifestError("OFFLINE_MANIFEST_FORBIDDEN",403,"El alcance ya no está autorizado.");
  const membership=await tx.membership.findUnique({where:{userId_organizationId:{userId:user.id,organizationId:contract.organizationId}},select:{role:true}});
  if(!membership)throw new OfflineManifestError("OFFLINE_MANIFEST_FORBIDDEN",403,"El alcance ya no está autorizado.");
  const assigned=await tx.appView.findMany({take:OFFLINE_MANIFEST_MAX_VIEWS+1,where:{contractId:contract.id,active:true,userAccesses:{some:{contractId:contract.id,userId:user.id}}},orderBy:[{sortOrder:"asc"},{name:"asc"},{id:"asc"}]});
  if(assigned.length>OFFLINE_MANIFEST_MAX_VIEWS)throw new OfflineManifestError("OFFLINE_MANIFEST_LIMIT",400,"Demasiadas experiencias para un manifiesto completo.");
  if(query.appViewIds.some(id=>!assigned.some(view=>view.id===id)))throw new OfflineManifestError("APP_VIEW_FORBIDDEN",403,"Experiencia no asignada o inactiva.");
  const views=query.appViewIds.length?assigned.filter(view=>query.appViewIds.includes(view.id)):assigned;
  const [catalog,revisions,types]=await Promise.all([
    readOfflineRevisionCatalog(tx),readOfflineEntityRevisions(tx,contract.id),
    tx.entityType.findMany({take:OFFLINE_MANIFEST_MAX_ENTITIES+1,where:{contractId:contract.id},orderBy:{id:"asc"},include:{fields:{orderBy:[{sortOrder:"asc"},{createdAt:"asc"},{id:"asc"}],include:{options:{orderBy:[{sortOrder:"asc"},{label:"asc"},{id:"asc"}]}}},stateUpdateIdentity:true}}),
  ]);
  if(types.length>OFFLINE_MANIFEST_MAX_ENTITIES)throw new OfflineManifestError("OFFLINE_MANIFEST_LIMIT",400,"Demasiadas definiciones para un manifiesto completo.");
  // A REPORT may use a workflow not assigned separately; write-contract metadata can also
  // depend on another AppView. Hash those definitions, without exposing them to the caller.
  const readViews=await tx.appView.findMany({where:{contractId:contract.id},orderBy:{id:"asc"},take:OFFLINE_MANIFEST_MAX_ENTITIES+1});
  if(readViews.length>OFFLINE_MANIFEST_MAX_ENTITIES)throw new OfflineManifestError("OFFLINE_MANIFEST_LIMIT",400,"Demasiadas definiciones de experiencia para acreditar la lectura.");
  const readViewById=new Map(readViews.map(view=>[view.id,view]));
  const viewReferences=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(viewReferences):value&&typeof value==="object"?Object.entries(value).flatMap(([key,item])=>key==="stateUpdateAppViewId"&&typeof item==="string"?[item]:viewReferences(item)):[];
  const byId=new Map(types.map(type=>[type.id,type]));const revisionById=new Map(revisions.map(row=>[row.entityTypeId,row.dataRevision]));
  const selectedIds=new Set<string>();
  const dependenciesFor = (initial:string[], issues:Set<string>) => {
    const dependencies=new Set<string>(), pending=[...initial];
    while(pending.length){const id=pending.pop()!;if(dependencies.has(id))continue;dependencies.add(id);selectedIds.add(id);
      const type=byId.get(id);if(!type){issues.add("ENTITY_UNAVAILABLE");continue;}
      if(!type.isActive)issues.add("ENTITY_INACTIVE");
      pending.push(...configuredEntities(type.scheduleConfig));
      for(const field of type.fields.filter(field=>field.isActive&&field.type==="RELATION")){
        try{const relation=getRelationConfig(field.config);if(relation?.targetEntityTypeId)pending.push(relation.targetEntityTypeId);else issues.add("RELATION_DEFINITION_UNAVAILABLE");}catch{issues.add("RELATION_DEFINITION_UNAVAILABLE");}
      }
    }
    return dependencies;
  };
  const experiences=views.map(view=>{
    let valid=true;let config:ReturnType<typeof parseAppViewConfig>|undefined;
    try{config=parseAppViewConfig(view);}catch{valid=false;}
    const issues=new Set<string>();
    const initial=config?configuredEntities(config):[];
    const referenced=new Set<string>(),pendingViews=config?viewReferences(config):[];
    while(pendingViews.length){const id=pendingViews.pop()!;if(referenced.has(id))continue;referenced.add(id);const related=readViewById.get(id);
      if(!related?.active){issues.add("REFERENCED_VIEW_UNAVAILABLE");continue;}
      try{const parsed=parseAppViewConfig(related);initial.push(...configuredEntities(parsed));pendingViews.push(...viewReferences(parsed));}catch{issues.add("REFERENCED_VIEW_INVALID");}
    }
    const dependencies=dependenciesFor(initial,issues);
    const workflow=config?.type==="WORKFLOW"?config.workflowKey:undefined;
    const supported=workflow==="attendance"||workflow==="state-update";
    const coverage=workflow==="attendance"?(query.month?{kind:"attendance-days" as const,dates:monthDays(query.month)}:{kind:"context-required" as const})
      :workflow==="state-update"?(config&&"uniqueness"in config&&config.uniqueness.mode==="subject-date-fields"?{kind:"context-required" as const}
        :config&&"dateFieldId"in config&&config.dateFieldId&&!query.date?{kind:"context-required" as const}
        :{kind:"workflow-bounded-output" as const,date:query.date??null,subjectSet:"source-collection" as const,current:"explicit-event-or-null" as const,latest:"bounded-first-page" as const,certified:false as const})
      :{kind:"metadata-only" as const};
    return {appViewId:view.id,type:view.type,workflowKey:workflow??null,definitionRevision:offlineManifestHash({view,config}),dependsOn:[...dependencies].sort(),coverage:{...coverage,certified:false as const},
      status:!valid?"invalid-definition":issues.size?"dependency-unavailable":supported?"diagnostic":"metadata-only",issues:[...issues].sort()};
  });
  const rootIssues=new Set<string>();
  dependenciesFor(roots.allEntities?types.filter(type=>type.isActive).map(type=>type.id):(roots.entityTypeIds??[]),rootIssues);
  const entities=[...selectedIds].sort().map(id=>{const definition=byId.get(id);return {entityTypeId:id,definitionRevision:definition?offlineManifestHash(definition):null,dataRevision:revisionById.get(id)??null,tracked:!!definition&&revisionById.has(id),active:definition?.isActive??false};});
  const authorizationFingerprint=offlineManifestHash({user,app,contract,membership,assignedAppViewIds:assigned.map(view=>view.id).sort()});
  const viewsRevision=offlineManifestHash(assigned);
  const identity={applicationId:app.id,organizationId:contract.organizationId,userId:user.id,contractId:contract.id,authorizationFingerprint};
  // Shared with every opt-in business read. Deliberately conservative: all contract data
  // revisions/definitions participate until selective read vectors are separately accredited.
  const readBindingVector={version:1,representationVersion:1,available:catalog.tracking==="installed"&&types.every(type=>revisionById.has(type.id)),
    revision:offlineManifestHash({version:1,scope:identity,epoch:catalog.epoch,trackingSignature:catalog.attestationHash,
      definitions:offlineManifestHash(readViews),entities:types.map(type=>({id:type.id,definition:offlineManifestHash(type),dataRevision:revisionById.get(type.id)??null}))})};
  const state={version:query.version,representationVersion:1,epoch:catalog.epoch,trackingSignature:catalog.attestationHash,scope:identity,context:{date:query.date??null,month:query.month??null},viewsRevision,readDefinitionsRevision:offlineManifestHash(readViews),readBindingVector,entities,experiences};
  const [clock]=await tx.$queryRaw<Array<{at:Date}>>`SELECT transaction_timestamp() AS at`;
  const manifest={...state,manifestRevision:offlineManifestHash(state),mode:"shadow" as const,reuseAllowed:false as const,
    tracking:{databaseDml:catalog.tracking,metadata:"snapshot-hash" as const,authorization:"snapshot-hash" as const,dependenciesResolved:rootIssues.size===0&&catalog.tracking==="installed"&&entities.every(entity=>entity.tracked)&&experiences.every(view=>view.status!=="invalid-definition"&&view.status!=="dependency-unavailable")},
    capabilities:{revisionBoundBusinessReads:false as const,persistedClientReceipts:false as const,clientMaySkipReads:false as const},
    snapshot:{isolation:"repeatable-read" as const,at:clock.at.toISOString()}};
  const negotiation=query.version===2?negotiateOfflineManifest(query.negotiation,
    {scopeFingerprint:offlineManifestHash(identity),manifestVectorRevision:readBindingVector.revision,epoch:catalog.epoch,definitionsRevision:state.readDefinitionsRevision},
    manifest.readBindingVector.available&&manifest.tracking.dependenciesResolved&&entities.every(entity=>entity.active&&entity.tracked),
    offlineManifestHash({scope:identity,query}),{enabled:!!query.month && selectiveReuseEnabled(contract.id),appViewIds:experiences.filter(view=>view.workflowKey==="attendance"&&view.status==="diagnostic").map(view=>view.appViewId)}):undefined;
  return {...manifest,...(negotiation?{negotiation}:{})};
}

export async function getOfflineManifest(scope:OfflineManifestScope,query:OfflineManifestRequest) {
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return buildOfflineManifest(tx,scope,query);
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,maxWait:5000,timeout:10000});
}
