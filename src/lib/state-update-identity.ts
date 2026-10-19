import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type CompositeIdentity = { version: 1; definitionId: string; values: Record<string, string> };
export type CompositeDefinition = { id: string; contractId: string; targetEntityTypeId: string; subjectFieldId: string; dateFieldId: string; fieldIds: string[]; version: number };
export function identityContextKey(values: Record<string, string>) {
  return JSON.stringify(Object.entries(values).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
export function canonicalReportKey(definition: CompositeDefinition, subject: string, date: string, identity: CompositeIdentity) {
  if (identity.version !== 1 || identity.definitionId !== definition.id || !subject || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("INVALID_COMPOSITE_IDENTITY");
  const ids = Object.keys(identity.values).sort();
  if (JSON.stringify(ids) !== JSON.stringify([...definition.fieldIds].sort()) || ids.some(id => !identity.values[id] || identity.values[id].trim() !== identity.values[id])) throw new Error("INCOMPLETE_COMPOSITE_IDENTITY");
  return JSON.stringify([1, definition.id, definition.contractId, definition.targetEntityTypeId, subject, date, JSON.parse(identityContextKey(identity.values))]);
}
export async function registerCompositeDefinition(input: Omit<CompositeDefinition, "id" | "version">) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "EntityType" WHERE id=${input.targetEntityTypeId} AND "contractId"=${input.contractId} FOR UPDATE`;
    const existing = await tx.stateUpdateIdentityDefinition.findUnique({ where: { targetEntityTypeId: input.targetEntityTypeId } });
    if (existing) {
      if (existing.subjectFieldId !== input.subjectFieldId || existing.dateFieldId !== input.dateFieldId || JSON.stringify(existing.fieldIds) !== JSON.stringify([...input.fieldIds].sort())) throw new Error("COMPOSITE_DEFINITION_IMMUTABLE");
      return existing.id;
    }
    if (await tx.entityRecord.count({ where: { entityTypeId: input.targetEntityTypeId } })) throw new Error("COMPOSITE_TARGET_MUST_BE_EMPTY");
    const legacy = await tx.appView.findFirst({ where: { contractId: input.contractId, config: { path: ["targetEntityTypeId"], equals: input.targetEntityTypeId } } });
    if (legacy) throw new Error("COMPOSITE_TARGET_HAS_LEGACY_WORKFLOW");
    return (await tx.stateUpdateIdentityDefinition.create({ data: { ...input, id: randomUUID(), fieldIds: [...input.fieldIds].sort() } })).id;
  });
}
export async function claimReport(tx: Prisma.TransactionClient, definition: CompositeDefinition, subject: string, date: string, identity: CompositeIdentity) {
  const canonicalKey = canonicalReportKey(definition, subject, date, identity);
  const identityHash = createHash("sha256").update(canonicalKey).digest("hex");
  const id = randomUUID();
  await tx.$executeRaw`INSERT INTO "StateUpdateIdentitySlot" (id,"definitionId","canonicalKey","identityHash","contextKey",date,"subjectRecordId") VALUES (${id},${definition.id},${canonicalKey},${identityHash},${identityContextKey(identity.values)},${date}::date,${subject}) ON CONFLICT ("definitionId","identityHash") DO NOTHING`;
  const rows = await tx.$queryRaw<Array<{ id: string; canonicalKey: string; recordId: string | null }>>`SELECT * FROM "StateUpdateIdentitySlot" WHERE "definitionId"=${definition.id} AND "identityHash"=${identityHash} FOR UPDATE`;
  if (rows[0]?.canonicalKey !== canonicalKey) throw new Error("COMPOSITE_IDENTITY_HASH_COLLISION");
  await tx.$queryRaw`SELECT set_config('opco.composite_identity',${definition.id},true)`;
  return rows[0];
}
