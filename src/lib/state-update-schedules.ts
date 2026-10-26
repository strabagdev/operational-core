import { createHash, randomUUID } from "node:crypto";
import { Prisma, type EntityFieldType } from "@prisma/client";
import { z } from "zod";
import { createAuditEvent } from "./audit";
import { getAuthorizedContractAdmin } from "./contracts";
import { dateOnlyInputValue } from "./date-only";
import { prisma } from "./prisma";
import { keyify } from "./format";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
}, "Fecha inválida");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const zone = z.string().refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Zona IANA inválida");
const nonempty = z.string().trim().min(1);
export const scheduleRevisionInput = z.object({ name: nonempty, startTime: time, endTime: time,
  endDayOffset: z.number().int().min(0).max(1), effectiveFrom: date });
/** Native editor form: absence is invalid, never an implicit same-day offset. */
export function scheduleRevisionFromForm(form:FormData) {
  const get=(key:string)=>{const value=form.get(key);return typeof value==="string"?value:"";};
  const offset=get("endDayOffset");
  return scheduleRevisionInput.parse({name:get("name"),startTime:get("startTime"),endTime:get("endTime"),effectiveFrom:get("effectiveFrom"),endDayOffset:offset==="0"?0:offset==="1"?1:Number.NaN});
}
export type ScheduleReference = { schemaVersion: 1; bindingId: string; revisionId: string; revisionDigest: string } | { kind: "legacy" };
export type ScheduleApplication = Exclude<ScheduleReference, {kind: "legacy"}> & {
  scheduleRecordId: string; operationalDate: string;
  applied: { name: string; startTime: string; endTime: string; endDayOffset: number; timeZone: string; nominalMinutes: number; durationPolicy: "civil-clock" };
} | { kind: "legacy" };
type CatalogConfig = { schemaVersion: 1; kind: "catalog"; catalogId: string; timeZone: string; codeFieldId: string; retiredFromDateFieldId: string;
  revisionEntityTypeId: string; revisionFields: Record<"scheduleRelation"|"sequence"|"name"|"startTime"|"endTime"|"endDayOffset"|"timeZone"|"effectiveFrom", string> };
export type ScheduleConsumer = { schemaVersion: 1; kind: "consumer"; bindingId: string; catalogEntityTypeId: string; sourceFieldId: string; dateFieldId: string;
  activeFrom: string; optionBindings: Array<{optionId: string; scheduleRecordId: string}>;
  requirement: "required-for-new-records"; operationalDatePolicy: "explicit-start-date"; durationPolicy: "civil-clock" };
const consumerSchema = z.object({ schemaVersion: z.literal(1), kind: z.literal("consumer"), bindingId: nonempty, catalogEntityTypeId: nonempty,
  sourceFieldId: nonempty, dateFieldId: nonempty, activeFrom: date, optionBindings: z.array(z.object({optionId:nonempty,scheduleRecordId:nonempty})).min(1),
  requirement: z.literal("required-for-new-records"), operationalDatePolicy:z.literal("explicit-start-date"),durationPolicy:z.literal("civil-clock") });
export class ScheduleError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "ScheduleError"; }
}
function fail(code: string, message: string): never { throw new ScheduleError(code, message); }
export function scheduleConsumer(raw: unknown): ScheduleConsumer | undefined {
  if (raw == null) return;
  const result = consumerSchema.safeParse(raw);
  if (!result.success) fail("INVALID_SCHEDULE_CONFIG", "La configuración de horario requiere revisión.");
  return result.data;
}
export function parseScheduleReference(raw: unknown): ScheduleReference {
  const schema = z.union([z.object({kind:z.literal("legacy")}).strict(),z.object({schemaVersion:z.literal(1),bindingId:nonempty,revisionId:nonempty,revisionDigest:nonempty}).strict()]);
  const result = schema.safeParse(raw);
  if (!result.success) fail("INVALID_SCHEDULE_REFERENCE", "La referencia de horario es inválida.");
  return result.data;
}
export function nominalScheduleMinutes(startTime: string, endTime: string, endDayOffset: number) {
  time.parse(startTime); time.parse(endTime);
  const minutes = (value: string) => Number(value.slice(0,2))*60 + Number(value.slice(3));
  if (endDayOffset !== 0 && endDayOffset !== 1) fail("INVALID_SCHEDULE_DURATION", "El desplazamiento final debe ser 0 o 1.");
  const value = 1440*endDayOffset + minutes(endTime)-minutes(startTime);
  if (value <= 0) fail("INVALID_SCHEDULE_DURATION", "La duración nominal debe ser positiva.");
  return value;
}
function today(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  return ["year","month","day"].map(type=>parts.find(part=>part.type===type)!.value).join("-");
}
async function requireAdmin(contractId: string, userId: string) {
  if (!await getAuthorizedContractAdmin(contractId,userId)) fail("SCHEDULE_ADMIN_REQUIRED", "Se requiere administración del contrato.");
}
function asJson(value: unknown) { return value as Prisma.InputJsonValue; }
async function configPermission(tx: Prisma.TransactionClient, contractId: string, catalogId: string) {
  await tx.$queryRaw`SELECT set_config('opco.schedule_config',${contractId},true)`;
  await tx.$queryRaw`SELECT set_config('opco.schedule_admin',${catalogId},true)`;
}
async function catalog(tx: Prisma.TransactionClient, contractId: string, id: string, lock = false) {
  if (lock) await tx.$queryRaw`SELECT id FROM "EntityType" WHERE id=${id} AND "contractId"=${contractId} FOR UPDATE`;
  const entity = await tx.entityType.findFirst({where:{id,contractId,isActive:true}});
  const raw = entity?.scheduleConfig as CatalogConfig | null;
  if (!raw || raw.schemaVersion!==1 || raw.kind!=="catalog" || raw.catalogId!==id) fail("INVALID_SCHEDULE_CATALOG", "Catálogo de horarios no disponible en este contrato.");
  return raw;
}
export async function createScheduleCatalog(contractId: string, userId: string, input: { name: string; timeZone: string }) {
  await requireAdmin(contractId,userId);
  const name = nonempty.parse(input.name), timeZone = zone.parse(input.timeZone);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Contract" WHERE id=${contractId} FOR UPDATE`;
    if (await tx.entityType.findFirst({where:{contractId,scheduleConfig:{path:["kind"],equals:"catalog"}}})) fail("SCHEDULE_CATALOG_EXISTS", "El contrato ya tiene un catálogo de horarios.");
    const id = randomUUID(), revisionEntityTypeId = randomUUID();
    await configPermission(tx,contractId,id);
    const config: CatalogConfig = {schemaVersion:1,kind:"catalog",catalogId:id,timeZone,codeFieldId:randomUUID(),retiredFromDateFieldId:randomUUID(),revisionEntityTypeId,
      revisionFields:Object.fromEntries(["scheduleRelation","sequence","name","startTime","endTime","endDayOffset","timeZone","effectiveFrom"].map(key=>[key,randomUUID()])) as CatalogConfig["revisionFields"]};
    await tx.entityType.create({data:{id,contractId,name,slug:"schedules-"+id,nature:"REFERENCE",scheduleConfig:asJson(config)}});
    await tx.entityType.create({data:{id:revisionEntityTypeId,contractId,name:name+" · Revisiones",slug:"schedule-revisions-"+id,nature:"REFERENCE",scheduleConfig:{schemaVersion:1,kind:"revisions",catalogId:id}}});
    const field = (eid:string,fid:string,key:string,type:EntityFieldType,required=true,config?:Prisma.InputJsonValue) => tx.entityField.create({data:{id:fid,entityTypeId:eid,key:keyify(key),name:key,type,required,config}});
    await field(id,config.codeFieldId,"Código","TEXT");
    await field(id,config.retiredFromDateFieldId,"Retirado desde","DATE",false);
    const types: Record<keyof CatalogConfig["revisionFields"],EntityFieldType> = {scheduleRelation:"RELATION",sequence:"INTEGER",name:"TEXT",startTime:"TIME",endTime:"TIME",endDayOffset:"INTEGER",timeZone:"TEXT",effectiveFrom:"DATE"};
    for (const [key,fid] of Object.entries(config.revisionFields)) await field(revisionEntityTypeId,fid,key,types[key as keyof typeof types],true,key==="scheduleRelation" ? {targetEntityTypeId:id,relationKind:"ONE"} : undefined);
    await createAuditEvent(tx,{contractId,entityTypeId:id,actorUserId:userId,action:"CONTRACT_UPDATED",summary:"Configuró catálogo de horarios",metadata:{timeZone}});
    return id;
  });
}
export async function publishScheduleRevision(contractId:string,userId:string,catalogId:string,input:z.infer<typeof scheduleRevisionInput> & {scheduleRecordId?:string;code?:string}) {
  await requireAdmin(contractId,userId);
  const values = scheduleRevisionInput.parse(input);
  nominalScheduleMinutes(values.startTime,values.endTime,values.endDayOffset);
  return prisma.$transaction(async tx=>{
    const config = await catalog(tx,contractId,catalogId,true);
    await configPermission(tx,contractId,catalogId);
    let scheduleRecordId = input.scheduleRecordId;
    if (!scheduleRecordId) {
      const code = nonempty.parse(input.code);
      if (await tx.entityRecord.findFirst({where:{entityTypeId:catalogId,values:{some:{entityFieldId:config.codeFieldId,textValue:code}}}})) fail("SCHEDULE_CODE_EXISTS","El código ya existe. Selecciona ese horario.");
      scheduleRecordId = (await tx.entityRecord.create({data:{entityTypeId:catalogId,displayName:code,values:{create:{entityFieldId:config.codeFieldId,textValue:code}}}})).id;
    }
    const codeRecord = await tx.entityRecord.findFirst({where:{id:scheduleRecordId,entityTypeId:catalogId},include:{values:true}});
    if (!codeRecord) fail("INVALID_SCHEDULE_CODE","Horario no disponible en el catálogo.");
    const retiredFrom=codeRecord.values.find(v=>v.entityFieldId===config.retiredFromDateFieldId)?.dateValue;
    if (retiredFrom && values.effectiveFrom>=dateOnlyInputValue(retiredFrom)) fail("SCHEDULE_RETIRED","La revisión debe comenzar antes del retiro efectivo.");
    const revisions = await readRevisions(tx,config,scheduleRecordId);
    const latest = revisions.at(-1);
    if (latest && (values.effectiveFrom<=latest.effectiveFrom || values.effectiveFrom<=today(config.timeZone))) fail("AMBIGUOUS_SCHEDULE_EFFECTIVITY","La nueva revisión debe comenzar en una fecha futura posterior a la última revisión.");
    const id = randomUUID(), sequence = (latest?.sequence ?? 0)+1;
    const payload = {...values,timeZone:config.timeZone,sequence};
    await tx.entityRecord.create({data:{id,entityTypeId:config.revisionEntityTypeId,displayName:values.name+" · R"+sequence,
      values:{create:Object.entries(payload).map(([key,value])=>({entityFieldId:config.revisionFields[key as keyof typeof config.revisionFields],
        ...(key==="effectiveFrom"?{dateValue:new Date(value+"T00:00:00.000Z")}:typeof value==="number"?{integerValue:value}:{textValue:value})}))},
      outgoingRelations:{create:{sourceFieldId:config.revisionFields.scheduleRelation,targetRecordId:scheduleRecordId}}}});
    await createAuditEvent(tx,{contractId,actorUserId:userId,entityTypeId:config.revisionEntityTypeId,entityRecordId:id,action:"RECORD_CREATED",summary:"Publicó revisión de horario",metadata:{scheduleRecordId,sequence,effectiveFrom:values.effectiveFrom}});
    return {scheduleRecordId,revisionId:id};
  });
}
type Revision = z.infer<typeof scheduleRevisionInput> & {id:string;sequence:number;timeZone:string};
async function readRevisions(tx:Prisma.TransactionClient,config:CatalogConfig,recordId:string):Promise<Revision[]> {
  const records = await tx.entityRecord.findMany({where:{entityTypeId:config.revisionEntityTypeId,outgoingRelations:{some:{sourceFieldId:config.revisionFields.scheduleRelation,targetRecordId:recordId}}},include:{values:true}});
  return records.map(record=>{
    const value = (key:keyof CatalogConfig["revisionFields"])=>record.values.find(v=>v.entityFieldId===config.revisionFields[key]);
    return {id:record.id,name:value("name")!.textValue!,startTime:value("startTime")!.textValue!,endTime:value("endTime")!.textValue!,endDayOffset:value("endDayOffset")!.integerValue!,
      timeZone:value("timeZone")!.textValue!,effectiveFrom:dateOnlyInputValue(value("effectiveFrom")!.dateValue!),sequence:value("sequence")!.integerValue!};
  }).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));
}
export async function retireSchedule(contractId:string,userId:string,catalogId:string,recordId:string,retiredFrom:string) {
  await requireAdmin(contractId,userId); date.parse(retiredFrom);
  return prisma.$transaction(async tx=>{
    const config = await catalog(tx,contractId,catalogId,true);
    if (retiredFrom<today(config.timeZone)) fail("INVALID_SCHEDULE_RETIREMENT","El retiro no puede ser retrospectivo.");
    const code = await tx.entityRecord.findFirst({where:{id:recordId,entityTypeId:catalogId},include:{values:true}});
    if (!code || code.values.some(v=>v.entityFieldId===config.retiredFromDateFieldId && v.dateValue)) fail("SCHEDULE_RETIREMENT_IMMUTABLE","El retiro ya está fijado o el horario no existe.");
    await configPermission(tx,contractId,catalogId);
    await tx.entityValue.create({data:{entityRecordId:recordId,entityFieldId:config.retiredFromDateFieldId,dateValue:new Date(retiredFrom+"T00:00:00.000Z")}});
    await createAuditEvent(tx,{contractId,actorUserId:userId,entityRecordId:recordId,entityTypeId:catalogId,action:"RECORD_UPDATED",summary:"Retiró horario desde una fecha operacional",metadata:{retiredFrom}});
  });
}
export async function activateSchedulePolicy(contractId:string,userId:string,targetId:string,input:{catalogId:string;sourceFieldId:string;activeFrom:string;optionBindings:ScheduleConsumer["optionBindings"]}) {
  await requireAdmin(contractId,userId);date.parse(input.activeFrom);
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "EntityType" WHERE id=${targetId} AND "contractId"=${contractId} FOR UPDATE`;
    const target = await tx.entityType.findFirst({where:{id:targetId,contractId,isActive:true},include:{stateUpdateIdentity:true,fields:{include:{options:true}}}});
    const definition = target?.stateUpdateIdentity;
    if (!target || !definition || !(definition.fieldIds as string[]).includes(input.sourceFieldId)) fail("SCHEDULE_REQUIRES_COMPOSITE","Selecciona un campo SELECT de la identidad compuesta.");
    if (target.scheduleConfig) fail("SCHEDULE_POLICY_IMMUTABLE","La política de horario ya está activada.");
    const config = await catalog(tx,contractId,input.catalogId,true);
    const field = target.fields.find(f=>f.id===input.sourceFieldId);
    if (!field || field.type!=="SELECT" || field.multiple || !field.isActive) fail("INVALID_SCHEDULE_FIELD","Se requiere SELECT simple activo.");
    if (new Set(input.optionBindings.map(b=>b.optionId)).size!==input.optionBindings.length || field.options.filter(o=>o.isActive).some(o=>!input.optionBindings.some(b=>b.optionId===o.id)) || input.optionBindings.some(b=>!field.options.some(o=>o.id===b.optionId))) fail("INCOMPLETE_SCHEDULE_BINDINGS","Vincula todas las opciones activas sin duplicarlas.");
    for (const binding of input.optionBindings) {
      if (!await tx.entityRecord.findFirst({where:{id:binding.scheduleRecordId,entityTypeId:input.catalogId}}) || !(await readRevisions(tx,config,binding.scheduleRecordId)).length) fail("INVALID_SCHEDULE_BINDING","El horario vinculado debe tener una revisión publicada.");
    }
    const policy:ScheduleConsumer={schemaVersion:1,kind:"consumer",bindingId:randomUUID(),catalogEntityTypeId:input.catalogId,sourceFieldId:input.sourceFieldId,dateFieldId:definition.dateFieldId,
      activeFrom:input.activeFrom,optionBindings:input.optionBindings,requirement:"required-for-new-records",operationalDatePolicy:"explicit-start-date",durationPolicy:"civil-clock"};
    consumerSchema.parse(policy);
    await configPermission(tx,contractId,input.catalogId);
    await tx.entityType.update({where:{id:targetId},data:{scheduleConfig:asJson(policy)}});
    await createAuditEvent(tx,{contractId,entityTypeId:targetId,actorUserId:userId,action:"CONTRACT_UPDATED",summary:"Activó horario para nuevas aplicaciones; históricos sin completar",metadata:asJson(policy)});
    return policy;
  });
}
export type ScheduleResolution = {schemaVersion:1;bindingId:string;sourceFieldId:string;dateFieldId:string;operationalDate:string;optionId?:string;status:"resolved"|"unavailable"|"context-required";reason?:string;application?:ScheduleApplication;effectiveFrom?:string;effectiveUntil?:string};
export async function resolveSchedule(tx:Prisma.TransactionClient,contractId:string,policy:ScheduleConsumer,operationalDate?:string,optionId?:string,lock=false):Promise<ScheduleResolution> {
  const base = {schemaVersion:1 as const,bindingId:policy.bindingId,sourceFieldId:policy.sourceFieldId,dateFieldId:policy.dateFieldId,operationalDate:operationalDate??"",optionId};
  if (!operationalDate || !optionId) return {...base,status:"context-required"};
  date.parse(operationalDate);
  const config = await catalog(tx,contractId,policy.catalogEntityTypeId,lock);
  const binding = policy.optionBindings.find(b=>b.optionId===optionId);
  if (!binding || operationalDate<policy.activeFrom) return {...base,status:"unavailable",reason:"SCHEDULE_NOT_EFFECTIVE"};
  const code = await tx.entityRecord.findFirst({where:{id:binding.scheduleRecordId,entityTypeId:policy.catalogEntityTypeId},include:{values:true}});
  if (!code) fail("INVALID_SCHEDULE_BINDING","El horario vinculado no está disponible.");
  const retiredFrom = code.values.find(v=>v.entityFieldId===config.retiredFromDateFieldId)?.dateValue;
  if (retiredFrom && operationalDate>=dateOnlyInputValue(retiredFrom)) return {...base,status:"unavailable",reason:"SCHEDULE_RETIRED"};
  const revisions = await readRevisions(tx,config,code.id), index = revisions.findLastIndex(r=>r.effectiveFrom<=operationalDate), revision = revisions[index];
  if (!revision) return {...base,status:"unavailable",reason:"SCHEDULE_REVISION_MISSING"};
  const applied={name:revision.name,startTime:revision.startTime,endTime:revision.endTime,endDayOffset:revision.endDayOffset,timeZone:revision.timeZone,nominalMinutes:nominalScheduleMinutes(revision.startTime,revision.endTime,revision.endDayOffset),durationPolicy:"civil-clock" as const};
  const revisionDigest=createHash("sha256").update(JSON.stringify([revision.id,code.id,revision.sequence,revision.effectiveFrom,applied])).digest("hex");
  const effectiveUntil = [revisions[index+1]?.effectiveFrom,retiredFrom?dateOnlyInputValue(retiredFrom):undefined].filter((v):v is string=>!!v).sort()[0];
  return {...base,status:"resolved",effectiveFrom:revision.effectiveFrom,...(effectiveUntil?{effectiveUntil}:{}),application:{schemaVersion:1,bindingId:policy.bindingId,revisionId:revision.id,revisionDigest,scheduleRecordId:code.id,operationalDate,applied}};
}
export async function applySchedule(tx:Prisma.TransactionClient,contractId:string,policy:ScheduleConsumer,reference:ScheduleReference|undefined,operationalDate:string,optionId:string,existing?:{scheduleApplication:Prisma.JsonValue|null}) {
  if (!reference) fail("SCHEDULE_CLIENT_UPDATE_REQUIRED","Actualiza Client y revisa el horario antes de guardar. Tu cambio se conserva.");
  if (existing) {
    const application = (existing.scheduleApplication??{kind:"legacy"}) as ScheduleApplication;
    const expected = "kind" in application?{kind:"legacy"}:{schemaVersion:1,bindingId:application.bindingId,revisionId:application.revisionId,revisionDigest:application.revisionDigest};
    if (JSON.stringify(parseScheduleReference(reference))!==JSON.stringify(parseScheduleReference(expected))) fail("SCHEDULE_APPLICATION_CHANGED","La edición debe conservar el horario aplicado al reporte.");
    return application;
  }
  const resolution=await resolveSchedule(tx,contractId,policy,operationalDate,optionId,true);
  if (resolution.status!=="resolved" || !resolution.application || "kind" in reference || "kind" in resolution.application || reference.bindingId!==policy.bindingId || reference.revisionId!==resolution.application.revisionId || reference.revisionDigest!==resolution.application.revisionDigest) fail("SCHEDULE_REVISION_CHANGED","El horario guardado ya no corresponde a esta fecha. Conserva el cambio y revisa explícitamente la revisión.");
  return resolution.application;
}
export async function scheduleEditorData(contractId:string,userId:string) {
  await requireAdmin(contractId,userId);
  const row=await prisma.entityType.findFirst({where:{contractId,scheduleConfig:{path:["kind"],equals:"catalog"}}});
  if (!row) return null;
  const config=row.scheduleConfig as CatalogConfig;
  const codes=await prisma.entityRecord.findMany({where:{entityTypeId:row.id},include:{values:true},orderBy:{displayName:"asc"}});
  return {id:row.id,name:row.name,config,codes:await Promise.all(codes.map(async code=>({id:code.id,name:code.displayName,canPublish:!code.values.some(v=>v.entityFieldId===config.retiredFromDateFieldId && v.dateValue && dateOnlyInputValue(v.dateValue)<=today(config.timeZone)),retiredFrom:dateOnlyInputValue(code.values.find(v=>v.entityFieldId===config.retiredFromDateFieldId)?.dateValue),revisions:await readRevisions(prisma,config,code.id)})))};
}
