import type { Prisma } from "@prisma/client";
import { WorkflowWritePolicyError } from "./workflow-write-policy";
import type { SerializedFieldValue } from "./field-validation";

export type CaptureTimeConfig = { fieldId: string; timeZone: string };
export type CaptureTimeCommand = CaptureTimeConfig & { version: 1 };
export type CaptureTimeRead = CaptureTimeCommand & { value: string | null; source: "DEVICE_CONFIRMATION" | null };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function validCaptureZone(value: unknown): value is string {
  if (typeof value !== "string" || !/^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/.test(value)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}
export function parseCaptureTime(value: unknown): CaptureTimeConfig | undefined {
  if (value === undefined) return undefined;
  if (!object(value) || typeof value.fieldId !== "string" || !value.fieldId.trim() || value.fieldId !== value.fieldId.trim() || !validCaptureZone(value.timeZone) || Object.keys(value).some(k => !["fieldId", "timeZone"].includes(k))) {
    throw new WorkflowWritePolicyError("CAPTURE_TIME_CONFIG_INVALID", "Configura un campo DATETIME y una zona IANA válidos.");
  }
  return { fieldId: value.fieldId, timeZone: value.timeZone };
}
export const validCaptureInstant = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
export function captureTimeContract(config: { captureTime?: CaptureTimeConfig }) {
  return config.captureTime ? { captureTime: { version: 1 as const, ...config.captureTime } } : {};
}
export function assertCaptureCommand(config: { captureTime?: CaptureTimeConfig }, input: { captureTime?: CaptureTimeCommand; eventOccurredAt?: string }) {
  if (!config.captureTime) {
    if (input.captureTime) throw new WorkflowWritePolicyError("CAPTURE_TIME_CONFIG_CHANGED", "La configuración de captura cambió. La intención se conserva para revisión.");
    return;
  }
  const sent = input.captureTime;
  if (!sent || sent.version !== 1 || sent.fieldId !== config.captureTime.fieldId || sent.timeZone !== config.captureTime.timeZone || Object.keys(sent).some(k => !["version", "fieldId", "timeZone"].includes(k))) {
    throw new WorkflowWritePolicyError("CAPTURE_TIME_REVIEW_REQUIRED", "Esta experiencia requiere un comando de captura compatible. El pendiente anterior se conserva; no se le asignó una hora nueva.");
  }
  if (input.eventOccurredAt !== undefined && !validCaptureInstant(input.eventOccurredAt)) throw new WorkflowWritePolicyError("INVALID_EVENT_TIME", "El instante de captura debe ser UTC ISO con milisegundos.");
}
export function captureTimeRead(config: { captureTime?: CaptureTimeConfig }, values: { entityFieldId: string; dateValue?: Date | null }[]) {
  if (!config.captureTime) return {};
  const stored = values.find(v => v.entityFieldId === config.captureTime!.fieldId)?.dateValue;
  return { captureTime: { version: 1 as const, ...config.captureTime, value: stored?.toISOString() ?? null, source: stored ? "DEVICE_CONFIRMATION" as const : null } };
}
/** Includes inactive definitions: deactivation does not authorize rewriting their original capture. */
export async function captureTimeFieldIds(tx: Prisma.TransactionClient, entityTypeId: string) {
  const views = await tx.appView.findMany({ where: { type: "WORKFLOW", config: { path: ["targetEntityTypeId"], equals: entityTypeId } }, select: { config: true } });
  return [...new Set(views.flatMap(v => { const c = object(v.config) ? v.config : {}; const capture = parseCaptureTime(c.captureTime); return capture ? [capture.fieldId] : []; }))];
}
/** Field-level fence; other fields retain their existing permissions, version checks and validation. */
export async function protectCaptureValues(tx: Prisma.TransactionClient, entityTypeId: string, values: SerializedFieldValue[], recordId?: string, creation?: { config: CaptureTimeConfig; instant: string }, submittedIds?: string[]) {
  const ids = await captureTimeFieldIds(tx, entityTypeId);
  if (!ids.length) return values;
  if (!recordId) {
    if (!creation || !ids.includes(creation.config.fieldId) || !validCaptureInstant(creation.instant)) throw new WorkflowWritePolicyError("CAPTURE_TIME_WORKFLOW_REQUIRED", "Las altas de este destino requieren su workflow compatible con captura automática.");
    if (values.some(v => ids.includes(v.fieldId) && v.fieldId !== creation.config.fieldId && v.dateValue)) throw new WorkflowWritePolicyError("CAPTURE_TIME_IMMUTABLE");
    return [...values.filter(v => !ids.includes(v.fieldId)), { fieldId: creation.config.fieldId, dateValue: new Date(creation.instant) }];
  }
  const old = await tx.entityValue.findMany({ where: { entityRecordId: recordId, entityFieldId: { in: ids } }, select: { entityFieldId: true, dateValue: true } });
  for (const v of values.filter(v => ids.includes(v.fieldId))) {
    if (submittedIds && !submittedIds.includes(v.fieldId)) continue;
    const original = old.find(o => o.entityFieldId === v.fieldId)?.dateValue?.toISOString() ?? null;
    if ((v.dateValue?.toISOString() ?? null) !== original) throw new WorkflowWritePolicyError("CAPTURE_TIME_IMMUTABLE", "La hora de captura original es automática y no puede modificarse. Puedes editar los demás campos.");
  }
  return [...values.filter(v => !ids.includes(v.fieldId)), ...old.map(v => ({ fieldId: v.entityFieldId, dateValue: v.dateValue }))];
}

export async function validateCaptureBindingChange(tx: Prisma.TransactionClient, previous: unknown, next: unknown) {
  const old = object(previous) ? previous : {}, after = object(next) ? next : {};
  const before = parseCaptureTime(old.captureTime), capture = parseCaptureTime(after.captureTime);
  if (before && (before.fieldId !== capture?.fieldId || old.targetEntityTypeId !== after.targetEntityTypeId) && await tx.entityValue.count({where:{entityFieldId:before.fieldId,dateValue:{not:null}}})) throw new WorkflowWritePolicyError("CAPTURE_TIME_BINDING_IN_USE", "La captura tiene historial. Conserva su vínculo; no se reescriben ni desprotegen horas históricas.");
  if (capture && capture.fieldId !== before?.fieldId) {
    const managed = await captureTimeFieldIds(tx,String(after.targetEntityTypeId));
    if (!managed.includes(capture.fieldId) && await tx.entityValue.count({where:{entityFieldId:capture.fieldId,dateValue:{not:null}}})) throw new WorkflowWritePolicyError("CAPTURE_TIME_FIELD_NOT_EMPTY", "Usa un DATETIME sin valores anteriores; no se atribuyen fechas históricas a capturas del dispositivo.");
  }
}

export function assertCaptureFieldRole(field: {type:string;multiple:boolean;required?:boolean;isUnique?:boolean;config?:unknown}) {
  const c=object(field.config)?field.config:{},validation=object(c.validation)?c.validation:{};
  if(field.type!=="DATETIME" || field.multiple || field.required || validation.required || field.isUnique || c.defaultValue!==undefined && c.defaultValue!==null) throw new WorkflowWritePolicyError("CAPTURE_TIME_FIELD_INVALID","La captura automática requiere un DATETIME simple, opcional, sin valor predeterminado ni unicidad.");
}
export async function protectCaptureFieldDefinition(tx:Prisma.TransactionClient,entityTypeId:string,fieldId:string,input:{type:string;multiple:boolean;required?:boolean;isUnique?:boolean;isActive?:boolean;validation?:{required?:boolean};defaultValue?:unknown}) {
  if((await captureTimeFieldIds(tx,entityTypeId)).includes(fieldId)) {
    assertCaptureFieldRole({...input,required:input.validation?.required??input.required,config:{defaultValue:input.defaultValue}});
    if(input.isActive===false)throw new WorkflowWritePolicyError("CAPTURE_TIME_FIELD_IN_USE","Conserva activo el campo automático de las experiencias configuradas.");
  }
}
