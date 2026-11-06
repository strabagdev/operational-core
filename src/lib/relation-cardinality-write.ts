import { Prisma } from "@prisma/client";
import { relationCardinalityIssue, relationKind, relationKindIsAmbiguous } from "./relation-cardinality";
import { lockWritePolicyTargets } from "./workflow-write-policy";
type Client = Prisma.TransactionClient;
function reject(message: string): never { const error = new Error(message); error.name = "UserFacingError"; throw error; }
export async function assertRelationFieldEdit(tx: Client, entityTypeId: string, fieldId: string, input: {type: string; multiple: boolean; relationKind?: "ONE" | "MANY"; confirmRelationCardinality?: boolean}) {
  // Also protects repairs of an old contradictory RELATION. Non-relation edits retain their old path.
  if (input.type !== "RELATION") return;
  await lockWritePolicyTargets(tx, [entityTypeId], true);
  const current = await tx.entityField.findUnique({where:{id:fieldId},select:{type:true,multiple:true,config:true}});
  if (!current) reject("El campo ya no está disponible.");
  if (current.type === "RELATION" && relationCardinalityIssue(current) && !input.confirmRelationCardinality) reject("Confirma explícitamente la revisión de cardinalidad de la relación antes de guardar.");
  if ((input.relationKind ?? "ONE") === "ONE") {
    const rows = await tx.$queryRaw<Array<{sourceRecordId:string}>>(Prisma.sql`SELECT "sourceRecordId" FROM "EntityRelation" WHERE "sourceFieldId"=${fieldId} GROUP BY "sourceRecordId" HAVING count(*)>1 LIMIT 1`);
    if (rows.length) reject("No puedes reducir a una relación: existen registros con varias relaciones. No se modificaron sus vínculos.");
  }
}
export async function assertRelationMutationCardinality(tx: Client, relations: {fieldId:string;targetRecordIds:string[]}[]) {
  if (!relations.length) return;
  const fields = await tx.entityField.findMany({where:{id:{in:[...new Set(relations.map(r=>r.fieldId))]}},select:{id:true,type:true,multiple:true,config:true}});
  const byId = new Map(fields.map(f=>[f.id,f]));
  for (const relation of relations) {
    const field = byId.get(relation.fieldId);
    if (!field || field.type !== "RELATION") reject("El campo de relación ya no está disponible.");
    if (relationKindIsAmbiguous(field.config)) reject("La definición de cardinalidad es ambigua. El comando se conserva para revisión.");
    if (relationKind(field.config) === "ONE" && new Set(relation.targetRecordIds).size > 1) reject("Este campo admite solo una relación. La definición cambió; revisa el comando conservado.");
  }
}
