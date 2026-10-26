import { randomUUID } from "node:crypto";

import bcrypt from "bcrypt";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "./prisma";
import { createAppView, getAppViewInput } from "./app-views";
import { getStateUpdateWorkflow, saveStateUpdateWorkflow } from "./state-update-workflow";
import * as audit from "./audit";
import { Prisma } from "@prisma/client";
import { activateSchedulePolicy, createScheduleCatalog, publishScheduleRevision, resolveSchedule, retireSchedule, scheduleEditorData, type ScheduleConsumer, type ScheduleApplication } from "./state-update-schedules";

const enabled = process.env.SCHEDULE_PG_INTEGRATION === "1";
const test = enabled ? describe.sequential : describe.skip;
const prefix = "schedule_local_" + randomUUID().replaceAll("-", "").slice(0,12);
const id = (s: string) => prefix + "_" + s;
const f = { org:id("org"),user:id("user"),app:id("app"),contract:id("contract"),source:id("source"),target:id("target"),subject:id("subject"),date:id("date"),shift:id("shift"),group:id("group"),status:id("status"),counter:id("counter"),note:id("note"),equipment:id("equipment"),otherEquipment:id("other_equipment"),a:id("a"),b:id("b"),g1:id("g1"),g2:id("g2"),ok:id("ok"),down:id("down"),view:"",otherView:"",definition:"",email:id("user")+"@example.invalid",password:randomUUID(),clientId:id("client"),day:"2026-10-18" };
let validatedLocal = false;
const identity = (shift=f.a,group=f.g1) => ({version:1 as const,definitionId:f.definition,values:{[f.shift]:shift,[f.group]:group}});
function body(request:string, value=10, context=identity(), extra:Record<string,unknown>={}) {
 return { clientRequestId:request, subjectRecordId:f.equipment, date:f.day, identity:context, states:{[f.status]:f.ok,[f.counter]:value,[f.note]:"Sintético"}, ...extra };
}
const save = (b:unknown,view=f.view) => saveStateUpdateWorkflow({appId:f.app,appViewId:view,contractId:f.contract,userId:f.user,body:b});
const data = (r:Awaited<ReturnType<typeof save>>) => { if(!r.ok)throw Error("Unexpected controlled error");return r.data.result; };
async function setupView(slug:string, historyMode="update-current", extraIds:string[]=[f.shift,f.group], stateIds:string[]=[f.status,f.counter,f.note]) {
 const form=new FormData();for(const [k,v] of Object.entries({type:"WORKFLOW",name:"Contexto sintético "+slug,slug:slug.replaceAll("_","-"),active:"on",workflowKey:"state-update",sourceEntityTypeId:f.source,targetEntityTypeId:f.target,subjectFieldId:f.subject,dateFieldId:f.date,uniquenessMode:"subject-date-fields",historyMode}))form.set(k,v);
 for(const v of extraIds)form.append("identityFieldIds",v);
 for(const v of stateIds)form.append("stateFieldIds",v);
 form.append("requiredStateFieldIds",f.status);
 const view=await createAppView(f.contract,f.user,getAppViewInput(form));if(!view)throw Error("View setup denied");
 await prisma.userAppViewAccess.create({data:{contractId:f.contract,userId:f.user,appViewId:view.id}});return view;
}
async function cleanup(){
 await prisma.$transaction(async tx=>{
  const catalog=await tx.entityType.findFirst({where:{contractId:f.contract,scheduleConfig:{path:["kind"],equals:"catalog"}}});
  await tx.$queryRaw`SELECT set_config('opco.schedule_config',${f.contract},true)`;
  if(catalog)await tx.$queryRaw`SELECT set_config('opco.schedule_admin',${catalog.id},true)`;
  await tx.entityType.updateMany({where:{contractId:f.contract},data:{scheduleConfig:Prisma.DbNull}});
  await tx.stateUpdateIdentitySlot.deleteMany({where:{definitionId:f.definition||"not-created"}});
  await tx.stateUpdateIdentityDefinition.deleteMany({where:{targetEntityTypeId:f.target}});
  await tx.apiIdempotencyKey.deleteMany({where:{contractId:f.contract}});
  await tx.auditEvent.deleteMany({where:{contractId:f.contract}});
  await tx.entityRelation.deleteMany({where:{sourceRecord:{entityType:{contractId:f.contract}}}});
  await tx.organization.deleteMany({where:{id:f.org}});
  await tx.user.deleteMany({where:{id:f.user}});
 });
}
let catalogId:string, a:string, b:string, policy:ScheduleConsumer;
const reference=(application:ScheduleApplication)=>"kind" in application?application:{schemaVersion:1 as const,bindingId:application.bindingId,revisionId:application.revisionId,revisionDigest:application.revisionDigest};
async function resolved(day:string,option=f.a){const resolution=await resolveSchedule(prisma,f.contract,policy,day,option);if(!resolution.application)throw Error("No fixture revision");return resolution.application;}
const scheduled=async(request:string,day:string,value=10,context=identity(),extra:Record<string,unknown>={})=>({...body(request,value,context,extra),date:day,schedule:reference(await resolved(day,context.values[f.shift]))});
test("STATE_UPDATE schedules real local PostgreSQL",()=>{
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL??"");if(url.hostname!=="127.0.0.1"||url.port!=="5432"||url.pathname!=="/opco_development"||decodeURIComponent(url.username)!=="opco_dev")throw Error("LOCAL_DATABASE_REQUIRED");
  const [connected]=await prisma.$queryRaw<Array<{database:string;role:string}>>`SELECT current_database() AS database,current_user AS role`;
  expect(connected).toEqual({database:"opco_development",role:"opco_dev"});validatedLocal=true;
  await prisma.organization.create({data:{id:f.org,name:"Organización sintética de identidad",slug:f.org}});
  await prisma.user.create({data:{id:f.user,email:f.email,name:"Usuario sintético",passwordHash:await bcrypt.hash(f.password,10)}});
  await prisma.membership.create({data:{organizationId:f.org,userId:f.user,role:"ADMIN"}});
  await prisma.contract.create({data:{id:f.contract,organizationId:f.org,code:f.contract,name:"Contrato sintético",slug:f.contract}});
  await prisma.externalApp.create({data:{id:f.app,organizationId:f.org,clientId:f.clientId,name:"Client sintético",slug:f.app}});
  await prisma.entityType.create({data:{id:f.source,contractId:f.contract,name:"Sujetos sintéticos",slug:f.source}});
  await prisma.entityType.create({data:{id:f.target,contractId:f.contract,name:"Reportes sintéticos",slug:f.target,nature:"TRANSACTION"}});
  await prisma.entityField.create({data:{id:id("name"),entityTypeId:f.source,key:"name",name:"Nombre",type:"TEXT",searchable:true,config:{display:{primary:true}}}});
  for(const [recordId,name]of [[f.equipment,"TOLVA sintética"],[f.otherEquipment,"TOLVA secundaria"]])await prisma.entityRecord.create({data:{id:recordId,entityTypeId:f.source,displayName:name,values:{create:{entityFieldId:id("name"),textValue:name}}}});
  for(const [fieldId,key,type,config]of [[f.subject,"subject","RELATION",{targetEntityTypeId:f.source,relationKind:"ONE"}],[f.date,"date","DATE",{}],[f.shift,"shift","SELECT",{}],[f.group,"group","SELECT",{}],[f.status,"status","SELECT",{}],[f.counter,"counter","DECIMAL",{validation:{minimum:0}}],[f.note,"note","TEXT",{}]] as const)await prisma.entityField.create({data:{id:fieldId,key,name:key,entityTypeId:f.target,type,config}});
  for(const [optionId,fieldId,value,label]of [[f.a,f.shift,"A","A · 08:00–20:00"],[f.b,f.shift,"B","B · 20:00–08:00 siguiente"],[f.g1,f.group,"1","Grupo 1"],[f.g2,f.group,"2","Grupo 2"],[f.ok,f.status,"OK","Operativo"],[f.down,f.status,"DOWN","Fuera de servicio"]])await prisma.fieldOption.create({data:{id:optionId,entityFieldId:fieldId,value,label}});
  const view=await setupView(id("view"));f.view=view.id;
  const d=await prisma.stateUpdateIdentityDefinition.findUniqueOrThrow({where:{targetEntityTypeId:f.target}});f.definition=d.id;
  f.otherView=(await setupView(id("other_view"))).id;
 },30000);

 afterAll(async()=>{if(validatedLocal && process.env.SCHEDULE_KEEP_FIXTURE!=="1")await cleanup();await prisma.$disconnect();},30000);
 it("preserves existing unscheduled reports and explicitly activates a shared destination policy",async()=>{
  const legacy=data(await save({...body("legacy"),date:"2030-01-01"}));expect(legacy.result).toBe("CREATED");expect(legacy).not.toHaveProperty("scheduleApplication");
  catalogId=await createScheduleCatalog(f.contract,f.user,{name:"Jornadas sintéticas",timeZone:"America/Santiago"});
  a=(await publishScheduleRevision(f.contract,f.user,catalogId,{code:"A",name:"Jornada A",startTime:"08:00",endTime:"20:00",endDayOffset:0,effectiveFrom:"2020-01-01"})).scheduleRecordId;
  b=(await publishScheduleRevision(f.contract,f.user,catalogId,{code:"B",name:"Jornada B",startTime:"20:00",endTime:"08:00",endDayOffset:1,effectiveFrom:"2020-01-01"})).scheduleRecordId;
  await prisma.fieldOption.updateMany({where:{id:{in:[f.a,f.b]}},data:{isActive:false}});
  try {await expect(activateSchedulePolicy(f.contract,f.user,f.target,{catalogId,sourceFieldId:f.shift,activeFrom:"2020-01-01",optionBindings:[]})).rejects.toThrow();expect((await prisma.entityType.findUniqueOrThrow({where:{id:f.target}})).scheduleConfig).toBeNull();}
  finally {await prisma.fieldOption.updateMany({where:{id:{in:[f.a,f.b]}},data:{isActive:true}});}
  policy=await activateSchedulePolicy(f.contract,f.user,f.target,{catalogId,sourceFieldId:f.shift,activeFrom:"2020-01-01",optionBindings:[{optionId:f.a,scheduleRecordId:a},{optionId:f.b,scheduleRecordId:b}]});
  const read=await getStateUpdateWorkflow({appViewId:f.view,contractId:f.contract,userId:f.user,date:"2030-01-01",identity:identity(),subjectRecordId:f.equipment});if(!read.ok)throw Error("GET failed");
  expect(read.data.subjects[0].reports![0].current).toMatchObject({scheduleApplication:{kind:"legacy"}});
  expect(data(await save({...body("legacy-edit",11),date:"2030-01-01",schedule:{kind:"legacy"},overwrite:true,expectedUpdatedAt:"updatedAt" in legacy?legacy.updatedAt:undefined}))).toMatchObject({result:"UPDATED",scheduleApplication:{kind:"legacy"}});
  const backdated=await scheduled("explicit-past-start","2025-10-01",12);
  expect(data(await save(backdated))).toMatchObject({result:"CREATED",scheduleApplication:{operationalDate:"2025-10-01"}});

 });
 it("rejects an old incomplete client without reservations/content/idempotency effects",async()=>{
  const before=await counts();const result=await save({...body("old"),date:"2030-01-02"});expect(result.ok).toBe(false);if(!result.ok)expect((await result.response.json()).error.code).toBe("SCHEDULE_CLIENT_UPDATE_REQUIRED");expect(await counts()).toEqual(before);
 });
 it("applies canonical day/night snapshots and nominal clock duration across month/year and DST dates",async()=>{
  for(const day of ["2030-10-31","2030-12-31","2031-04-05","2031-09-06"]){
   for(const option of [f.a,f.b]){const app=await resolved(day,option);expect(app).toMatchObject({operationalDate:day,applied:{nominalMinutes:720,durationPolicy:"civil-clock",endDayOffset:option===f.b?1:0,timeZone:"America/Santiago"}});}
  }
  const request=await scheduled("create-night","2030-01-02",12,identity(f.b));const result=data(await save(request));expect(result).toMatchObject({result:"CREATED",scheduleApplication:{applied:{endDayOffset:1,nominalMinutes:720}}});
  const row=await prisma.entityRecord.findUniqueOrThrow({where:{id:"recordId"in result?result.recordId:""}});expect(row.scheduleApplication).toEqual("scheduleApplication"in result?result.scheduleApplication:undefined);
  const other=await getStateUpdateWorkflow({appViewId:f.otherView,contractId:f.contract,userId:f.user,date:"2030-01-02",identity:identity(f.b),subjectRecordId:f.equipment});if(!other.ok)throw Error("GET failed");expect(other.data.schedulePolicy).toEqual(policy);expect(other.data.subjects[0].reports![0].current?.scheduleApplication).toEqual(row.scheduleApplication);
 });
 it("serializes concurrent reports and replays accepted commands despite a later revision",async()=>{
  const first=await scheduled("race-one","2030-01-05",21), second={...first,clientRequestId:"race-two",states:{...first.states,[f.counter]:22}};
  const results=(await Promise.all([save(first),save(second)])).map(data);expect(results.map(r=>r.result).sort()).toEqual(["CONFLICT","CREATED"]);
  const winner=results.findIndex(r=>r.result==="CREATED");const command=winner===0?first:second;
  await publishScheduleRevision(f.contract,f.user,catalogId,{scheduleRecordId:a,name:"Nueva jornada A",startTime:"07:00",endTime:"19:00",endDayOffset:0,effectiveFrom:"2030-01-05"});
  expect(data(await save(command))).toEqual(results[winner]);
  const oldRef=first.schedule;
  const before=await counts();const stale=await save({...first,clientRequestId:"stale-revision",identity:identity(f.a,f.g2),schedule:oldRef});expect(stale.ok).toBe(false);if(!stale.ok)expect((await stale.response.json()).error.code).toBe("SCHEDULE_REVISION_CHANGED");expect(await counts()).toEqual(before);
  const accepted=results[winner];if(!("updatedAt"in accepted))throw Error("Expected created");
  const edited=data(await save({...command,clientRequestId:"preserve-application",overwrite:true,expectedUpdatedAt:accepted.updatedAt,states:{...command.states,[f.counter]:23}}));expect(edited).toMatchObject({result:"UPDATED",scheduleApplication:accepted.scheduleApplication});
  expect(data(await save({...command,clientRequestId:"stale-base",overwrite:true,expectedUpdatedAt:accepted.updatedAt,states:{...command.states,[f.counter]:24}}))).toMatchObject({result:"CONFLICT",existing:{scheduleApplication:accepted.scheduleApplication}});
 });
 it("keeps a conflicting local revision separate from the schedule already applied by another writer",async()=>{
  const old=await resolved("2030-01-04");
  const remote=await scheduled("other-revision-writer","2030-01-05",31,identity(f.a,f.g2));
  const created=data(await save(remote));expect(created.result).toBe("CREATED");
  const local={...remote,clientRequestId:"local-old-revision",schedule:reference(old)};
  const conflict=data(await save(local));expect(conflict).toMatchObject({result:"CONFLICT",existing:{scheduleApplication:created.scheduleApplication}});
  expect(data(await save(local))).toEqual(conflict); // same rejected command replays, never changes the application
  if(!("recordId" in created))throw Error("Expected created report");
  expect((await prisma.entityRecord.findUniqueOrThrow({where:{id:created.recordId}})).scheduleApplication).toEqual(created.scheduleApplication);
 });
 it("accepts an older still-applicable offline revision and keeps combinations separate",async()=>{
  const request=await scheduled("older-valid","2030-01-04",15,identity(f.a,f.g2));expect(data(await save(request)).result).toBe("CREATED");
  const current=await scheduled("newer-valid","2030-01-06",16,identity(f.a,f.g2));expect(data(await save(current)).result).toBe("CREATED");
  expect(reference(await resolved("2030-01-04"))).not.toEqual(reference(await resolved("2030-01-06")));
 });
 it("retirement prevents new applications while preserving prior application and revision immutability",async()=>{
  const request=await scheduled("before-retire","2030-01-08",18,identity(f.b,f.g2));const accepted=data(await save(request));expect(accepted.result).toBe("CREATED");
  await retireSchedule(f.contract,f.user,catalogId,b,"2030-01-07");
  expect(await resolveSchedule(prisma,f.contract,policy,"2030-01-07",f.b)).toMatchObject({status:"unavailable",reason:"SCHEDULE_RETIRED"});
  if(!("updatedAt"in accepted))throw Error("Expected created");expect(data(await save({...request,clientRequestId:"edit-retired",overwrite:true,expectedUpdatedAt:accepted.updatedAt,states:{...request.states,[f.counter]:19}}))).toMatchObject({result:"UPDATED",scheduleApplication:accepted.scheduleApplication});
  const editor=await scheduleEditorData(f.contract,f.user);expect(editor?.codes.find(c=>c.id===b)?.retiredFrom).toBe("2030-01-07");
  expect(editor?.codes.find(c=>c.id===b)?.canPublish).toBe(true);
  const beforeCut=await publishScheduleRevision(f.contract,f.user,catalogId,{scheduleRecordId:b,name:"Antes del retiro",startTime:"19:00",endTime:"07:00",endDayOffset:1,effectiveFrom:"2030-01-06"});
  expect(await resolveSchedule(prisma,f.contract,policy,"2030-01-06",f.b)).toMatchObject({status:"resolved",application:{revisionId:beforeCut.revisionId}});
  expect(await resolveSchedule(prisma,f.contract,policy,"2030-01-07",f.b)).toMatchObject({status:"unavailable",reason:"SCHEDULE_RETIRED"});
  await expect(publishScheduleRevision(f.contract,f.user,catalogId,{scheduleRecordId:b,name:"Fuera de vigencia",startTime:"19:00",endTime:"07:00",endDayOffset:1,effectiveFrom:"2030-01-07"})).rejects.toThrow(/retiro/);

  const revision=editor!.codes[0].revisions[0];await expect(prisma.entityRecord.update({where:{id:revision.id},data:{displayName:"tampered"}})).rejects.toThrow(/SCHEDULE_CATALOG_MANAGED/);
  await expect(prisma.entityType.update({where:{id:catalogId},data:{name:"tampered"}})).rejects.toThrow(/SCHEDULE_STRUCTURE_IMMUTABLE/);
  await expect(prisma.entityField.update({where:{id:editor!.config.revisionFields.startTime},data:{type:"TEXT"}})).rejects.toThrow(/SCHEDULE_STRUCTURE_IMMUTABLE/);
 });
 it("rejects publication from a non-administrator and freezes policy/shared option identity",async()=>{
  await prisma.membership.update({where:{userId_organizationId:{userId:f.user,organizationId:f.org}},data:{role:"MEMBER"}});
  try{await expect(publishScheduleRevision(f.contract,f.user,catalogId,{scheduleRecordId:a,name:"Denied",startTime:"08:00",endTime:"20:00",endDayOffset:0,effectiveFrom:"2031-01-01"})).rejects.toThrow(/administración/);}finally{await prisma.membership.update({where:{userId_organizationId:{userId:f.user,organizationId:f.org}},data:{role:"ADMIN"}});}
  await expect(activateSchedulePolicy(f.contract,f.user,f.target,{catalogId,sourceFieldId:f.shift,activeFrom:"2030-01-01",optionBindings:policy.optionBindings})).rejects.toThrow(/activada/);
 });
 it("serializes publication against a pinned create and rejects altered references without partial effects",async()=>{
  const request=await scheduled("publish-race","2032-01-01",33,identity(f.a,f.g2)),before=await counts();
  const [saved]=await Promise.all([save(request),publishScheduleRevision(f.contract,f.user,catalogId,{scheduleRecordId:a,name:"R3",startTime:"06:00",endTime:"18:00",endDayOffset:0,effectiveFrom:"2032-01-01"})]);
  if(saved.ok){expect(saved.data.result.result).toBe("CREATED");expect(data(await save(request))).toEqual(saved.data.result);expect((await counts()).records).toBe(before.records+1);}
  else {expect((await saved.response.json()).error.code).toBe("SCHEDULE_REVISION_CHANGED");expect((await counts()).records).toBe(before.records);}
  const valid=await scheduled("tampered","2032-01-02",34,identity(f.a,f.g2)),baseline=await counts();
  const rejected=await save({...valid,schedule:{...valid.schedule,revisionDigest:"tampered"}});expect(rejected.ok).toBe(false);expect(await counts()).toEqual(baseline);
 });
 it("rolls back applied snapshot, content, reservation, audit and replay together",async()=>{
  const before=await counts(), request=await scheduled("rollback","2030-01-03",20);
  const original=audit.createAuditEvent, failure=vi.spyOn(audit,"createAuditEvent").mockImplementation(async(tx,input)=>{await original(tx,input);throw Error("controlled audit rollback");});
  try{await expect(save(request)).rejects.toThrow("controlled audit rollback");}finally{failure.mockRestore();}
  expect(await counts()).toEqual(before);const result=data(await save(request));expect(result.result).toBe("CREATED");expect(data(await save(request))).toEqual(result);
 });
});
async function counts(){return {records:await prisma.entityRecord.count({where:{entityTypeId:f.target}}),slots:await prisma.stateUpdateIdentitySlot.count({where:{definitionId:f.definition}}),keys:await prisma.apiIdempotencyKey.count({where:{contractId:f.contract}}),audit:await prisma.auditEvent.count({where:{contractId:f.contract}})};}
