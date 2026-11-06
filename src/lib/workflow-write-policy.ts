import { assertRelationMutationCardinality } from "./relation-cardinality-write";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getRelationConfig, parseFieldConfig } from "./field-validation";

export type WorkflowWritePolicy = { version: 1; mode: "workflow-only"; acceptNewCommands: boolean; allowedAppViewIds: string[] };
export type WorkflowWriteCommand = { version: 1; configurationFingerprint: string; capabilities: ["relation-context-v1"] };
export type WorkflowWriteContract = { version: 1; configurationFingerprint: string; requiredCapabilities: ["relation-context-v1"]; authorized: boolean; acceptNewCommands: boolean };
type Config = Record<string, unknown>;
type Client = Prisma.TransactionClient;
type View = { id: string; config: Prisma.JsonValue };
const object = (v: unknown): v is Config => !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown) => Array.isArray(v) && v.every(x => typeof x === "string" && x.length > 0) ? v as string[] : [];
export class WorkflowWritePolicyError extends Error {
  constructor(public code: string, message = "Este destino requiere un workflow y un comando compatibles. La intención se conserva.") { super(message); this.name = "UserFacingError"; }
}
export function parseWorkflowWritePolicy(value: unknown): WorkflowWritePolicy | undefined {
  if (value === undefined || value === null) return undefined;
  if (!object(value) || value.version !== 1 || value.mode !== "workflow-only" || typeof value.acceptNewCommands !== "boolean" ||
      !Array.isArray(value.allowedAppViewIds) || strings(value.allowedAppViewIds).length !== value.allowedAppViewIds.length || !value.allowedAppViewIds.length ||
      Object.keys(value).some(k => !["version", "mode", "acceptNewCommands", "allowedAppViewIds"].includes(k))) throw new WorkflowWritePolicyError("INVALID_WORKFLOW_WRITE_POLICY");
  return { version: 1, mode: "workflow-only", acceptNewCommands: value.acceptNewCommands, allowedAppViewIds: [...new Set(value.allowedAppViewIds as string[])].sort() };
}
export function parseWorkflowWriteCommand(value: unknown): WorkflowWriteCommand | undefined {
  if (value === undefined) return undefined;
  if (!object(value) || value.version !== 1 || typeof value.configurationFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(value.configurationFingerprint) ||
      !Array.isArray(value.capabilities) || value.capabilities.length !== 1 || value.capabilities[0] !== "relation-context-v1" ||
      Object.keys(value).some(k => !["version", "configurationFingerprint", "capabilities"].includes(k))) throw new WorkflowWritePolicyError("WORKFLOW_COMMAND_INCOMPATIBLE");
  return { version: 1, configurationFingerprint: value.configurationFingerprint, capabilities: ["relation-context-v1"] };
}
function binding(config: unknown) {
  if (!object(config) || (config.type !== undefined && config.type !== "WORKFLOW") || !["attendance", "state-update"].includes(String(config.workflowKey))) throw new WorkflowWritePolicyError("WORKFLOW_NOT_AUTHORIZED");
  const attendance = config.workflowKey === "attendance";
  const uniqueness = attendance ? "subject-date" : object(config.uniqueness) ? config.uniqueness.mode : undefined;
  if (!attendance && (config.historyMode !== "update-current" || !["subject", "subject-date"].includes(String(uniqueness)))) throw new WorkflowWritePolicyError("WORKFLOW_NOT_AUTHORIZED");
  return { source: config.sourceEntityTypeId, target: config.targetEntityTypeId, subject: attendance ? config.personFieldId : config.subjectFieldId,
    date: uniqueness === "subject-date" ? config.dateFieldId : null, uniqueness,
    extras: [...new Set([...strings(attendance ? config.contextFieldIds : config.extraFieldIds), ...(attendance && typeof config.observationFieldId === "string" ? [config.observationFieldId] : [])])].sort() };
}
export async function lockWritePolicyTargets(tx: Client, ids: string[], exclusive = false) {
  const selected = [...new Set(ids)].sort(); if (!selected.length) return;
  if (exclusive) await tx.$queryRaw(Prisma.sql`SELECT id FROM "EntityType" WHERE id IN (${Prisma.join(selected)}) ORDER BY id FOR UPDATE`);
  else await tx.$queryRaw(Prisma.sql`SELECT id FROM "EntityType" WHERE id IN (${Prisma.join(selected)}) ORDER BY id FOR KEY SHARE`);
}
async function policyFor(tx: Client, entityTypeId: string) {
  const views = await tx.appView.findMany({ where: { type: "WORKFLOW", config: { path: ["targetEntityTypeId"], equals: entityTypeId } }, select: { id: true, config: true, contractId: true } });
  const owners = views.filter(view => object(view.config) && view.config.workflowWritePolicy != null);
  if (!owners.length) return null;
  if (owners.length !== 1) throw new WorkflowWritePolicyError("AMBIGUOUS_WORKFLOW_WRITE_POLICY");
  const owner = owners[0], config = owner.config as Config, policy = parseWorkflowWritePolicy(config.workflowWritePolicy)!;
  return { owner, config, policy };
}
async function contractFor(tx: Client, entityTypeId: string, appViewId: string) {
  const effective = await policyFor(tx, entityTypeId); if (!effective) return undefined;
  const { owner, policy, config } = effective, identity = binding(config);
  const fields = await tx.entityField.findMany({ where: { entityTypeId, id: { in: identity.extras } }, select: { id: true, type: true, required: true, multiple: true, isActive: true, config: true } });
  if (fields.length !== identity.extras.length) throw new WorkflowWritePolicyError("INVALID_WORKFLOW_WRITE_POLICY");
  const requirements = fields.filter(field => field.type === "SELECT" || field.type === "RELATION").map(field => ({ id: field.id, type: field.type, required: parseFieldConfig(field.config).validation.required ?? field.required,
    multiple: field.multiple, active: field.isActive, ...(field.type === "RELATION" ? { relation: getRelationConfig(field.config) } : {}) })).sort((a,b) => a.id.localeCompare(b.id));
  if (requirements.some(f => !f.active || f.multiple || !["SELECT", "RELATION"].includes(f.type) || (f.type === "RELATION" && (f.relation?.relationKind !== "ONE" || !f.relation.targetEntityTypeId)))) throw new WorkflowWritePolicyError("INVALID_WORKFLOW_WRITE_POLICY");
  const configurationFingerprint = createHash("sha256").update(JSON.stringify({ version: 1, owner: owner.id, contract: owner.contractId, entityTypeId, appViewId,
    allowed: policy.allowedAppViewIds, identity, requirements })).digest("hex");
  let compatible = false;
  try { const configured = appViewId === owner.id ? config : (await tx.appView.findUnique({where:{id:appViewId},select:{config:true}}))?.config; compatible = JSON.stringify(binding(configured)) === JSON.stringify(identity); } catch { compatible = false; }
  return { effective, requirements, contract: { version: 1 as const, configurationFingerprint, requiredCapabilities: ["relation-context-v1"] as ["relation-context-v1"],
    authorized: compatible && policy.allowedAppViewIds.includes(appViewId), acceptNewCommands: policy.acceptNewCommands } };
}
export async function workflowWriteMetadata(entityTypeId: string, appViewId: string) {
  const result = await contractFor(prisma, entityTypeId, appViewId);
  return { workflowWriteContract: result?.contract ?? null };
}
// This authority lives only on the transaction object, never in a header or request body.
const authorized = new WeakMap<object, Set<string>>();
export async function authorizeWorkflowWrite(tx: Client | undefined, config: unknown, appViewId: string, input: { writeCommand?: WorkflowWriteCommand; extraValues: Record<string, unknown> }) {
  const target = object(config) && typeof config.targetEntityTypeId === "string" ? config.targetEntityTypeId : "";
  const client = tx ?? prisma;
  if (tx) await lockWritePolicyTargets(tx, [target]);
  const effective = await contractFor(client, target, appViewId); if (!effective) return;
  if (!tx || !effective.contract.authorized) throw new WorkflowWritePolicyError("WORKFLOW_NOT_AUTHORIZED");
  const expected = binding(effective.effective.config), actual = binding(config);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new WorkflowWritePolicyError("WORKFLOW_NOT_AUTHORIZED");
  if (!effective.contract.acceptNewCommands) throw new WorkflowWritePolicyError("WORKFLOW_WRITES_PAUSED", "Las capturas de este destino están pausadas. La intención se conserva.");
  const command = parseWorkflowWriteCommand(input.writeCommand);
  if (!command || command.configurationFingerprint !== effective.contract.configurationFingerprint) throw new WorkflowWritePolicyError("WORKFLOW_COMMAND_INCOMPATIBLE", "Actualiza la experiencia y revisa explícitamente la intención. No se reemplazó su contexto ni autorización.");
  for (const field of effective.requirements) if (field.required && (!Object.prototype.hasOwnProperty.call(input.extraValues, field.id) || typeof input.extraValues[field.id] !== "string" || !String(input.extraValues[field.id]).trim())) throw new WorkflowWritePolicyError("WORKFLOW_CONTEXT_REQUIRED", "El comando debe incluir explícitamente todos los contextos obligatorios.");
  const set = authorized.get(tx) ?? new Set<string>(); set.add(target); authorized.set(tx, set);
}
export async function assertGenericEntityWritesAllowed(tx: Client, ids: string[]) {
  await lockWritePolicyTargets(tx, ids);
  for (const id of [...new Set(ids)]) if (await policyFor(tx, id)) throw new WorkflowWritePolicyError("WORKFLOW_WRITER_REQUIRED", "Este destino sólo admite sus workflows autorizados; editor, importador, API genérica y borrado están bloqueados.");
}
export async function assertRelationMutationAllowed(tx: Client, sourceRecordId: string, relations: {fieldId:string;targetRecordIds:string[]}[] = []) {
  const record = await tx.entityRecord.findUnique({ where: { id: sourceRecordId }, select: { entityTypeId: true } }); if (!record) return;
  await lockWritePolicyTargets(tx, [record.entityTypeId]);
  if (await policyFor(tx, record.entityTypeId)) {
    if (!authorized.get(tx)?.has(record.entityTypeId)) throw new WorkflowWritePolicyError("WORKFLOW_WRITER_REQUIRED");
  }
  await assertRelationMutationCardinality(tx, relations);
}
export async function assertRecordDeletionAllowed(tx: Client, entityTypeId: string, recordIds: string[]) {
  // Take policy locks before record/FK locks, including potential incoming sources.
  // KEY SHARE permits normal record writes but serializes activation during cascading deletion.
  const entity = await tx.entityType.findUnique({where:{id:entityTypeId},select:{contractId:true}});
  if (entity) {
    const types = await tx.entityType.findMany({where:{contractId:entity.contractId},select:{id:true}});
    await lockWritePolicyTargets(tx,types.map(type=>type.id));
  }

  if (recordIds.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM "EntityRecord" WHERE id IN (${Prisma.join([...recordIds].sort())}) ORDER BY id FOR UPDATE`);
  const incoming = await tx.entityRelation.findMany({ where: { targetRecordId: { in: recordIds } }, select: { sourceRecord: { select: { entityTypeId: true } } } });
  await assertGenericEntityWritesAllowed(tx, [entityTypeId, ...incoming.map(r => r.sourceRecord.entityTypeId)]);
}
export async function assertContractPurgeAllowed(tx: Client, contractId: string) {
  const entities = await tx.entityType.findMany({ where: { contractId }, select: { id: true } });
  await assertGenericEntityWritesAllowed(tx, entities.map(e => e.id));
}
/** Runs with the target locked exclusively; inactive views retain their fence. */
export async function validateWritePolicyChange(tx: Client, contractId: string, viewId: string, previous: unknown, next: unknown, disarm: boolean) {
  const submittedPrevious = object(previous) ? previous : {}, nextConfig = object(next) ? next : {};
  await lockWritePolicyTargets(tx, [submittedPrevious.targetEntityTypeId, nextConfig.targetEntityTypeId].filter((id): id is string => typeof id === "string"), true);
  const current = await tx.appView.findUnique({where:{id:viewId},select:{config:true}});
  const oldConfig = current && object(current.config) ? current.config : submittedPrevious;
  const oldPolicy = parseWorkflowWritePolicy(oldConfig.workflowWritePolicy), nextPolicy = parseWorkflowWritePolicy(nextConfig.workflowWritePolicy);
  const targets = [oldConfig.targetEntityTypeId, nextConfig.targetEntityTypeId].filter((id): id is string => typeof id === "string");
  await lockWritePolicyTargets(tx, targets, true);
  if (oldPolicy && !nextPolicy && (!disarm || oldPolicy.acceptNewCommands)) throw new WorkflowWritePolicyError("WORKFLOW_POLICY_DISARM_REQUIRED", "Pausa primero las capturas y confirma explícitamente el desarme de la política.");
  if (oldPolicy && nextConfig.targetEntityTypeId !== oldConfig.targetEntityTypeId) throw new WorkflowWritePolicyError("WORKFLOW_POLICY_TARGET_IMMUTABLE");
  if (oldPolicy && oldPolicy.acceptNewCommands && nextPolicy && (JSON.stringify(binding(oldConfig)) !== JSON.stringify(binding(nextConfig)) || JSON.stringify(oldPolicy.allowedAppViewIds) !== JSON.stringify(nextPolicy.allowedAppViewIds))) throw new WorkflowWritePolicyError("WORKFLOW_POLICY_PAUSE_REQUIRED");
  if (!nextPolicy) return oldPolicy;
  if (!oldPolicy && nextPolicy.acceptNewCommands) throw new WorkflowWritePolicyError("WORKFLOW_POLICY_INITIAL_PAUSE_REQUIRED", "Arma primero la política con las capturas pausadas.");
  const identity = binding(nextConfig);
  const fields = await tx.entityField.findMany({where:{entityTypeId:String(identity.target),id:{in:identity.extras}},select:{id:true,type:true,multiple:true,isActive:true,config:true}});
  if (fields.length !== identity.extras.length || fields.some(f => !f.isActive || (f.type === "RELATION" && (f.multiple || getRelationConfig(f.config).relationKind !== "ONE" || !getRelationConfig(f.config).targetEntityTypeId)))) throw new WorkflowWritePolicyError("INVALID_WORKFLOW_WRITE_POLICY");
  if (!nextPolicy.allowedAppViewIds.includes(viewId)) throw new WorkflowWritePolicyError("INVALID_WORKFLOW_WRITE_POLICY");
  const other = await policyFor(tx, String(identity.target));
  if (other && other.owner.id !== viewId) throw new WorkflowWritePolicyError("WORKFLOW_POLICY_ALREADY_DEFINED");
  const views: View[] = await tx.appView.findMany({ where: { contractId, id: { in: nextPolicy.allowedAppViewIds } }, select: { id: true, config: true } });
  const configs = new Map(views.map(v => [v.id, v.config])); configs.set(viewId, nextConfig as Prisma.JsonObject);
  for (const id of nextPolicy.allowedAppViewIds) if (!configs.has(id) || JSON.stringify(binding(configs.get(id))) !== JSON.stringify(identity)) throw new WorkflowWritePolicyError("WORKFLOW_NOT_AUTHORIZED", "Todos los workflows autorizados deben conservar el mismo origen, destino, identidad y contextos.");
  return oldPolicy;
}

export function isWorkflowWriteRejectionCode(code: string) {
  return ["WORKFLOW_WRITES_PAUSED","WORKFLOW_NOT_AUTHORIZED","WORKFLOW_COMMAND_INCOMPATIBLE","WORKFLOW_CONTEXT_REQUIRED","AMBIGUOUS_WORKFLOW_WRITE_POLICY","INVALID_WORKFLOW_WRITE_POLICY"].includes(code);
}
/** Only this request's unexecuted claim; completed receipts are never removed. */
export async function releaseRejectedWorkflowClaim(tx: Client, appId: string, contractId: string, clientRequestId: string | undefined, claim: {operation:string;requestHash:string} | null) {
  if (!claim || !clientRequestId) return;
  await tx.apiIdempotencyKey.deleteMany({where:{externalAppId:appId,contractId,clientRequestId,operation:claim.operation,requestHash:claim.requestHash,completedAt:null,entityRecordId:null}});
}
