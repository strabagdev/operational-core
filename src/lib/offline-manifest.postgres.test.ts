import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";
import { afterAll,beforeAll,describe,expect,it,vi } from "vitest";
vi.mock("./prisma",async()=>{const {PrismaClient}=await import("@prisma/client");return{prisma:new PrismaClient({log:[{emit:"event",level:"query"}]})};});
import { prisma } from "./prisma";
import { buildOfflineManifest,getOfflineManifest,parseOfflineManifestRequest } from "./offline-manifest";
import { createEntityRecord,updateEntityRecord,deleteEntityRecordsPermanently,deleteRecordsConfirmationText,syncEntityRelations } from "./entity-records";
import { createApiEntityRecord,patchApiEntityRecord } from "./api-record-writes";
import { getApiEntityDefinition } from "./api-entities";
import { createAppView,getAppViewInput } from "./app-views";
import { importEntityRecords,RECORD_ID_HEADER } from "./entity-import";
import { saveStateUpdateWorkflow } from "./state-update-workflow";
import { saveAttendanceWorkflowDay } from "./attendance-workflow";
import { updateFieldOption,updateEntityField,getEntityFieldInput } from "./entity-config";
import { createScheduleCatalog,publishScheduleRevision,retireSchedule } from "./state-update-schedules";
import { archiveContractForAdmin,deleteContractForAdmin } from "./contract-admin";
import { deleteContractConfirmationText } from "./contract-deletion";
import { signApiAccessToken } from "./api-auth";
import { GET } from "../app/api/v1/contracts/[contractId]/offline/manifest/route";
const suite=process.env.OFFLINE_REVISION_PG==="1"?describe.sequential:describe.skip;
const prefix="shadow_"+randomUUID().replaceAll("-","").slice(0,10),id=(s:string)=>prefix+"_"+s;
const f={org:id("org"),app:id("app"),user:id("user"),member:id("member"),contract:id("contract"),other:id("other"),source:id("source"),flow:id("flow"),events:id("events"),catalog:id("catalog"),hidden:id("hidden"),text:id("text"),link:id("link"),person:id("person"),date:id("date"),status:id("status"),extra:id("extra"),choice:id("choice"),present:id("present"),absent:id("absent"),p1:id("p1"),p2:id("p2"),c1:id("c1"),c2:id("c2"),att:"",state:"",records:""};
const day="2026-11-11",query=()=>parseOfflineManifestRequest(new URLSearchParams("date="+day+"&month=2026-11"));
const scope=()=>({appId:f.app,userId:f.user,contractId:f.contract});
const manifest=()=>getOfflineManifest(scope(),query());
const rawRevisions=async()=>await prisma.$queryRaw<Array<{entityTypeId:string;dataRevision:string}>>`SELECT "entityTypeId","dataRevision"::text AS "dataRevision" FROM "OfflineEntityRevision" WHERE "contractId"=${f.contract} ORDER BY "entityTypeId"`;
const revision=async(entity:string)=>BigInt((await rawRevisions()).find(row=>row.entityTypeId===entity)!.dataRevision);
const metrics:Record<string,unknown>={};let count=0,sqlMs=0,dataQueries=0;
const drainQueryEvents=async()=>{await new Promise<void>(setImmediate);await new Promise<void>(setImmediate);};
async function view(workflow:"attendance"|"state-update"){
 const form=new FormData();const target=workflow==="attendance"?f.flow:f.events,suffix=workflow==="attendance"?"":"e";
 for(const[k,v]of Object.entries({type:"WORKFLOW",workflowKey:workflow,name:"Synthetic "+workflow,slug:id(workflow).replaceAll("_","-"),active:"on",sourceEntityTypeId:f.source,targetEntityTypeId:target,personFieldId:f.person,subjectFieldId:f.person+suffix,dateFieldId:f.date+suffix,statusFieldId:f.status,defaultCheckInOptionId:f.present,uniquenessMode:"subject",historyMode:"append"}))form.set(k,v);
 if(workflow==="attendance")form.append("contextFieldIds",f.extra);else form.append("stateFieldIds",f.status+suffix);
 const v=await createAppView(f.contract,f.user,getAppViewInput(form));if(!v)throw Error("Synthetic view denied");await prisma.userAppViewAccess.create({data:{contractId:f.contract,userId:f.user,appViewId:v.id}});return v.id;
}
async function assertChange(entity:string,write:()=>Promise<unknown>){const before=await revision(entity);await write();expect(await revision(entity)).toBeGreaterThan(before);}
function form(value:string){const x=new FormData();x.set("field_"+f.text,value);return x;}
async function imported(rows:unknown[][]){const w=new ExcelJS.Workbook();const s=w.addWorksheet("Synthetic");s.addRows(rows);const data=await w.xlsx.writeBuffer();return new File([new Uint8Array(data)],"synthetic.xlsx",{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});}
async function queued(){const[r]=await prisma.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM "OfflineRevisionPending"`;return Number(r.n);}
suite("authenticated revision manifest on isolated PostgreSQL",()=>{
 beforeAll(async()=>{
  const u=new URL(process.env.DATABASE_URL??"");if(u.hostname!=="127.0.0.1"||u.port!=="19543"||u.pathname!=="/opco_revision_shadow")throw Error("ISOLATED_REVISION_DATABASE_REQUIRED");
  const[db]=await prisma.$queryRaw<Array<{database:string;address:string}>>`SELECT current_database() AS database,inet_server_addr()::text AS address`;expect(db).toEqual({database:"opco_revision_shadow",address:"127.0.0.1/32"});
  (prisma as unknown as {$on(event:"query",callback:(event:{duration:number;query:string})=>void):void}).$on("query",event=>{count++;sqlMs+=event.duration;if(['"EntityRecord"','"EntityValue"','"EntityRelation"'].some(table=>event.query.includes(table)))dataQueries++;});
  await prisma.organization.create({data:{id:f.org,name:"Synthetic shadow",slug:f.org}});
  for(const user of[f.user,f.member]){await prisma.user.create({data:{id:user,email:user+"@example.invalid",passwordHash:"synthetic-no-login"}});await prisma.membership.create({data:{organizationId:f.org,userId:user,role:user===f.user?"ADMIN":"MEMBER"}});}
  await prisma.externalApp.create({data:{id:f.app,organizationId:f.org,clientId:f.app,name:"Synthetic app",slug:f.app}});
  for(const c of[f.contract,f.other])await prisma.contract.create({data:{id:c,organizationId:f.org,name:c,code:c,slug:c}});
  for(const entity of[f.source,f.flow,f.events,f.catalog,f.hidden])await prisma.entityType.create({data:{id:entity,contractId:f.contract,name:entity,slug:entity}});
  await prisma.entityField.create({data:{id:f.text,entityTypeId:f.source,name:"Synthetic text",key:"text",type:"TEXT",searchable:true,config:{display:{primary:true}}}});
  await prisma.entityField.create({data:{id:f.link,entityTypeId:f.source,name:"Synthetic link",key:"link",type:"RELATION",config:{relation:{relationKind:"ONE",targetEntityTypeId:f.catalog}}}});
  for(const[target,suffix]of[[f.flow,""],[f.events,"e"]]){
   for(const[field,key,type,config]of[[f.person+suffix,"subject","RELATION",{relationKind:"ONE",targetEntityTypeId:f.source}],[f.date+suffix,"day","DATE",{}],[f.status+suffix,"status","SELECT",{}]]as const)await prisma.entityField.create({data:{id:field,entityTypeId:target,name:key,key,type,config}});
   await prisma.fieldOption.createMany({data:[{id:f.present+suffix,entityFieldId:f.status+suffix,label:"A",value:"a"},{id:f.absent+suffix,entityFieldId:f.status+suffix,label:"B",value:"b"}]});
  }
  await prisma.entityField.create({data:{id:f.extra,entityTypeId:f.flow,name:"Context",key:"context",type:"RELATION",config:{targetEntityTypeId:f.catalog,relationKind:"ONE"}}});
  for(const[record,entity]of[[f.p1,f.source],[f.p2,f.source],[f.c1,f.catalog],[f.c2,f.catalog]])await prisma.entityRecord.create({data:{id:record,entityTypeId:entity,displayName:"Synthetic "+record}});
  f.att=await view("attendance");f.state=await view("state-update");
  const records=await prisma.appView.create({data:{contractId:f.contract,name:"Synthetic records",slug:id("records"),type:"RECORDS",config:{entityTypeId:f.source}}});f.records=records.id;await prisma.userAppViewAccess.create({data:{contractId:f.contract,userId:f.user,appViewId:f.records}});
 });
 afterAll(async()=>{if(process.env.OFFLINE_REVISION_METRICS)writeFileSync(process.env.OFFLINE_REVISION_METRICS,JSON.stringify(metrics,null,2));await prisma.$disconnect();});
 it("returns stable scoped diagnostics, 30 dates, dependencies, and never authorizes Client reuse",async()=>{
  const a=await manifest(),b=await manifest();expect(a.manifestRevision).toBe(b.manifestRevision);expect(a.mode).toBe("shadow");expect(a.reuseAllowed).toBe(false);expect(a.capabilities.clientMaySkipReads).toBe(false);expect(a.capabilities.revisionBoundBusinessReads).toBe(false);expect(a.tracking).toMatchObject({databaseDml:"installed",dependenciesResolved:true});expect(a.snapshot.isolation).toBe("repeatable-read");
  expect(a.entities.map(e=>e.entityTypeId)).toEqual([f.catalog,f.events,f.flow,f.source].sort());expect(a.entities.some(e=>e.entityTypeId===f.hidden)).toBe(false);expect(a.experiences.find(e=>e.appViewId===f.att)?.coverage).toMatchObject({kind:"attendance-days",dates:expect.arrayContaining([day])});expect((a.experiences.find(e=>e.appViewId===f.att)?.coverage as {dates:string[]}).dates).toHaveLength(30);expect(await queued()).toBe(0);
 });
 it("covers editor create/update/delete and keeps deletion tombstones",async()=>{
  let created:{id:string}|null=null;await assertChange(f.source,async()=>{created=await createEntityRecord(f.contract,f.source,f.user,form("Editor one"));});if(!created)throw Error("Synthetic create denied");const record=created as{id:string};
  await assertChange(f.source,()=>updateEntityRecord(f.contract,f.source,record.id,f.user,form("Editor two")));
  await assertChange(f.source,()=>deleteEntityRecordsPermanently(f.contract,f.source,[record.id],f.user,deleteRecordsConfirmationText(1)));
  expect(await prisma.entityRecord.findUnique({where:{id:record.id}})).toBeNull();
 });
 it("covers generic API create/patch, idempotent replay and failed validation without a revision change",async()=>{
  const entity=await getApiEntityDefinition(f.contract,f.source);if(!entity)throw Error("Fixture definition missing");const body={clientRequestId:id("api-create"),values:{text:"API one",link:f.c1}};
  const before=await revision(f.source);const created=await createApiEntityRecord({appId:f.app,contractId:f.contract,userId:f.user,entity,body});expect(created.ok).toBe(true);if(!created.ok)throw Error("Fixture create denied");expect(await revision(f.source)).toBeGreaterThan(before);
  const stable=await revision(f.source);expect(await createApiEntityRecord({appId:f.app,contractId:f.contract,userId:f.user,entity,body})).toMatchObject({ok:true,replay:true,recordId:created.recordId});expect(await revision(f.source)).toBe(stable);
  await assertChange(f.source,async()=>{const result=await patchApiEntityRecord({appId:f.app,contractId:f.contract,userId:f.user,entity,recordId:created.recordId,body:{values:{text:"API two",link:f.c2}}});expect(result.ok).toBe(true);});
  const now=await revision(f.source);const invalid=await createApiEntityRecord({appId:f.app,contractId:f.contract,userId:f.user,entity,body:{clientRequestId:id("api-invalid"),values:{link:id("missing")}}});expect(invalid.ok).toBe(false);expect(await revision(f.source)).toBe(now);
 });
 it("covers Excel import creation and bulk/raw update path",async()=>{
  await assertChange(f.source,async()=>{await importEntityRecords({contractId:f.contract,entityTypeId:f.source,userId:f.user,file:await imported([["Synthetic text","Synthetic link"],["Imported one",""]])});});
  const row=await prisma.entityRecord.findFirstOrThrow({where:{entityTypeId:f.source,displayName:"Imported one"}});
  await assertChange(f.source,async()=>{await importEntityRecords({contractId:f.contract,entityTypeId:f.source,userId:f.user,file:await imported([[RECORD_ID_HEADER,"Synthetic text","Synthetic link"],[row.id,"Imported two",""]])});});
 });
 it("covers actual Attendance and STATE_UPDATE writers, retaining states/context and replay",async()=>{
  const attendanceBody={clientRequestId:id("att"),date:day,entries:[{personRecordId:f.p1,statusOptionId:f.present,contextValues:{[f.extra]:f.c1}}]};
  await assertChange(f.flow,async()=>{expect((await saveAttendanceWorkflowDay({appId:f.app,appViewId:f.att,contractId:f.contract,userId:f.user,body:attendanceBody})).ok).toBe(true);});
  const stable=await revision(f.flow);expect((await saveAttendanceWorkflowDay({appId:f.app,appViewId:f.att,contractId:f.contract,userId:f.user,body:attendanceBody})).ok).toBe(true);expect(await revision(f.flow)).toBe(stable);
  await assertChange(f.events,async()=>{const result=await saveStateUpdateWorkflow({appId:f.app,appViewId:f.state,contractId:f.contract,userId:f.user,body:{clientRequestId:id("state"),subjectRecordId:f.p2,date:day,states:{[f.status+"e"]:f.present+"e"}}});expect(result.ok).toBe(true);});
  const row=await prisma.entityRecord.findFirstOrThrow({where:{entityTypeId:f.flow},include:{outgoingRelations:true}});expect(row.outgoingRelations.some(r=>r.sourceFieldId===f.extra&&r.targetRecordId===f.c1)).toBe(true);
 });
 it("preserves Attendance UNCHANGED, CONFLICT, explicit correction and idempotency",async()=>{
  const base=await prisma.entityRecord.findFirstOrThrow({where:{entityTypeId:f.flow}});const request={subjectRecordId:f.p1,date:day,states:{[f.status]:f.present},extraValues:{[f.extra]:f.c1}};
  const stable=await revision(f.flow);const same=await saveStateUpdateWorkflow({appId:f.app,appViewId:f.att,contractId:f.contract,userId:f.user,body:{...request,clientRequestId:id("same")}});expect(same).toMatchObject({ok:true,data:{result:{result:"UNCHANGED"}}});expect(await revision(f.flow)).toBe(stable);
  const conflict=await saveStateUpdateWorkflow({appId:f.app,appViewId:f.att,contractId:f.contract,userId:f.user,body:{...request,clientRequestId:id("conflict"),states:{[f.status]:f.absent}}});expect(conflict).toMatchObject({ok:true,data:{result:{result:"CONFLICT"}}});expect(await revision(f.flow)).toBe(stable);
  const corrected={...request,clientRequestId:id("correction"),states:{[f.status]:f.absent},extraValues:{[f.extra]:f.c2},overwrite:true,expectedUpdatedAt:base.updatedAt.toISOString()};const save=()=>saveStateUpdateWorkflow({appId:f.app,appViewId:f.att,contractId:f.contract,userId:f.user,body:corrected});expect(await save()).toMatchObject({ok:true,data:{result:{result:"UPDATED",recordId:base.id}}});const correctedRevision=await revision(f.flow);expect(correctedRevision).toBeGreaterThan(stable);expect(await save()).toMatchObject({ok:true,data:{result:{result:"UPDATED",recordId:base.id}}});expect(await revision(f.flow)).toBe(correctedRevision);
 });
 it("tracks standalone relation service and label updates through dependency revisions",async()=>{
  await assertChange(f.source,()=>prisma.$transaction(tx=>syncEntityRelations(tx,f.p1,[{fieldId:f.link,targetRecordIds:[f.c1]}])));
  const a=await manifest();await assertChange(f.catalog,()=>prisma.entityRecord.update({where:{id:f.c1},data:{displayName:"Synthetic renamed relation"}}));const b=await manifest();expect(b.manifestRevision).not.toBe(a.manifestRevision);expect(b.entities.find(e=>e.entityTypeId===f.catalog)?.dataRevision).not.toBe(a.entities.find(e=>e.entityTypeId===f.catalog)?.dataRevision);
 });
 it("detects a value-only update without relying on EntityRecord.updatedAt",async()=>{
  const value=await prisma.entityValue.upsert({where:{entityRecordId_entityFieldId:{entityRecordId:f.p2,entityFieldId:f.text}},create:{entityRecordId:f.p2,entityFieldId:f.text,textValue:"Before"},update:{textValue:"Before"}});const record=await prisma.entityRecord.findUniqueOrThrow({where:{id:f.p2}});
  await assertChange(f.source,()=>prisma.entityValue.update({where:{id:value.id},data:{textValue:"After"}}));expect((await prisma.entityRecord.findUniqueOrThrow({where:{id:f.p2}})).updatedAt).toEqual(record.updatedAt);
 });
 it("hashes SELECT option metadata even when the parent timestamp is unchanged",async()=>{
  const field=await prisma.entityField.findUniqueOrThrow({where:{id:f.status}}),a=await manifest();await updateFieldOption(f.contract,f.flow,f.status,f.present,f.user,{label:"Synthetic renamed option",value:"a",sortOrder:0,isActive:true});
  expect((await prisma.entityField.findUniqueOrThrow({where:{id:f.status}})).updatedAt).toEqual(field.updatedAt);const b=await manifest();expect(b.entities.find(e=>e.entityTypeId===f.flow)?.definitionRevision).not.toBe(a.entities.find(e=>e.entityTypeId===f.flow)?.definitionRevision);
 });
 it("covers configuration-driven displayName recalculation through its real bulk SQL writer",async()=>{
  const field=id("alternative_primary");await prisma.entityField.create({data:{id:field,entityTypeId:f.source,name:"Synthetic alternative",key:"alternative",type:"TEXT"}});await prisma.entityValue.create({data:{entityRecordId:f.p1,entityFieldId:field,textValue:"Synthetic new primary"}});const input=new FormData();for(const[k,v]of Object.entries({name:"Synthetic alternative",key:"alternative",type:"TEXT",isActive:"true",displayPrimary:"true"}))input.set(k,v);
  await assertChange(f.source,()=>updateEntityField(f.contract,f.source,field,f.user,getEntityFieldInput(input)));expect((await prisma.entityRecord.findUniqueOrThrow({where:{id:f.p1}})).displayName).toBe("Synthetic new primary");
 });
 it("tracks schedule catalog/revision creation and retirement (same generic records/relations)",async()=>{
  const catalog=await createScheduleCatalog(f.contract,f.user,{name:"Synthetic schedules",timeZone:"America/Santiago"});const before=await revision(catalog);const published=await publishScheduleRevision(f.contract,f.user,catalog,{code:"S",name:"Synthetic schedule",startTime:"08:00",endTime:"20:00",endDayOffset:0,effectiveFrom:"2020-01-01"});expect(await revision(catalog)).toBeGreaterThan(before);
  const config=(await prisma.entityType.findUniqueOrThrow({where:{id:catalog}})).scheduleConfig as{revisionEntityTypeId:string};expect(await revision(config.revisionEntityTypeId)).toBeGreaterThan(BigInt(0));await assertChange(catalog,()=>retireSchedule(f.contract,f.user,catalog,published.scheduleRecordId,"2090-01-01"));
 });
 it("tracks identity definition and slot insert/update/delete without rewriting business identities",async()=>{
  const definition=id("identity"),slot=id("slot");await assertChange(f.hidden,()=>prisma.stateUpdateIdentityDefinition.create({data:{id:definition,targetEntityTypeId:f.hidden,contractId:f.contract,subjectFieldId:f.person,dateFieldId:f.date,fieldIds:[]}}));
  await assertChange(f.hidden,()=>prisma.stateUpdateIdentitySlot.create({data:{id:slot,definitionId:definition,canonicalKey:"synthetic",identityHash:"synthetic",contextKey:"synthetic",date:new Date(day),subjectRecordId:f.p1}}));
  await assertChange(f.hidden,()=>prisma.stateUpdateIdentitySlot.update({where:{id:slot},data:{canonicalKey:"synthetic corrected"}}));await assertChange(f.hidden,()=>prisma.stateUpdateIdentitySlot.delete({where:{id:slot}}));await assertChange(f.hidden,()=>prisma.stateUpdateIdentityDefinition.delete({where:{id:definition}}));
 });
 it("rolls back mutations and revisions together, including a flush forced before later writes",async()=>{
  const a=await rawRevisions(),record=await prisma.entityRecord.findUniqueOrThrow({where:{id:f.p1}});
  await expect(prisma.$transaction(async tx=>{await tx.entityRecord.update({where:{id:f.p1},data:{displayName:"uncommitted"}});await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;throw Error("Synthetic rollback");})).rejects.toThrow("Synthetic rollback");
  expect(await rawRevisions()).toEqual(a);expect(await prisma.entityRecord.findUniqueOrThrow({where:{id:f.p1}})).toEqual(record);expect(await queued()).toBe(0);
  const before=await revision(f.source);await prisma.$transaction(async tx=>{await tx.entityRecord.update({where:{id:f.p1},data:{displayName:"committed first"}});await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;await tx.entityRecord.update({where:{id:f.p2},data:{displayName:"committed second"}});});expect(await revision(f.source)).toBe(before+BigInt(2));expect(await queued()).toBe(0);
 });
 it("does not lose concurrent increments for disjoint records in the same entity",async()=>{
  const before=await revision(f.source);await Promise.all(Array.from({length:12},(_,n)=>prisma.entityRecord.create({data:{id:id("parallel"+n),entityTypeId:f.source,displayName:"Synthetic concurrent"}})));expect(await revision(f.source)).toBe(before+BigInt(12));expect(await queued()).toBe(0);
 });
 it("keeps manifest revisions, metadata and authorized rows in the same repeatable-read snapshot",async()=>{
  let entered!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>{entered=r;}),hold=new Promise<void>(r=>{release=r;});let inside:string|undefined;
  const read=prisma.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;const a=await buildOfflineManifest(tx,scope(),query());const row=await tx.entityRecord.findUniqueOrThrow({where:{id:f.p1}});entered();await hold;const b=await buildOfflineManifest(tx,scope(),query());expect(b.manifestRevision).toBe(a.manifestRevision);expect((await tx.entityRecord.findUniqueOrThrow({where:{id:f.p1}})).displayName).toBe(row.displayName);expect(b.scope.authorizationFingerprint).toBe(a.scope.authorizationFingerprint);expect(b.entities).toEqual(a.entities);inside=a.manifestRevision;},{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:10000});
  await ready;await prisma.$transaction(async tx=>{await tx.entityRecord.update({where:{id:f.p1},data:{displayName:"New committed remote"}});await tx.fieldOption.update({where:{id:f.present},data:{label:"Concurrent metadata"}});await tx.membership.update({where:{userId_organizationId:{userId:f.user,organizationId:f.org}},data:{role:"MEMBER"}});});release();await read;expect((await manifest()).manifestRevision).not.toBe(inside);await prisma.membership.update({where:{userId_organizationId:{userId:f.user,organizationId:f.org}},data:{role:"ADMIN"}});
 });
 it("refuses a writable or read-committed transaction rather than returning a revision inconsistent with deferred writes",async()=>{
  await expect(prisma.$transaction(tx=>buildOfflineManifest(tx,scope(),query()))).rejects.toThrow("OFFLINE_MANIFEST_SNAPSHOT_REQUIRED");
  await expect(prisma.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;return buildOfflineManifest(tx,scope(),query());})).rejects.toThrow("OFFLINE_MANIFEST_SNAPSHOT_REQUIRED");
 });
 it("separates users/contracts and detects assignment, role and configuration changes",async()=>{
  const a=await manifest();const member=await getOfflineManifest({...scope(),userId:f.member},query());expect(member.experiences).toEqual([]);expect(member.scope.authorizationFingerprint).not.toBe(a.scope.authorizationFingerprint);
  await expect(getOfflineManifest({...scope(),userId:f.member},{...query(),appViewIds:[f.att]})).rejects.toMatchObject({status:403});const other=await getOfflineManifest({...scope(),contractId:f.other},query());expect(other.entities).toEqual([]);expect(other.scope.contractId).toBe(f.other);
  await prisma.membership.update({where:{userId_organizationId:{userId:f.user,organizationId:f.org}},data:{role:"MEMBER"}});expect((await manifest()).scope.authorizationFingerprint).not.toBe(a.scope.authorizationFingerprint);await prisma.membership.update({where:{userId_organizationId:{userId:f.user,organizationId:f.org}},data:{role:"ADMIN"}});
  await prisma.appView.update({where:{id:f.records},data:{name:"Changed synthetic definition"}});expect((await manifest()).viewsRevision).not.toBe(a.viewsRevision);
  await prisma.userAppViewAccess.delete({where:{userId_contractId_appViewId:{userId:f.user,contractId:f.contract,appViewId:f.records}}});expect((await manifest()).experiences.some(e=>e.appViewId===f.records)).toBe(false);
 });
 it.each(["user","app","organization","contract","membership"])("rejects revoked %s inside the manifest snapshot",async kind=>{
  if(kind==="user")await prisma.user.update({where:{id:f.user},data:{active:false}});if(kind==="app")await prisma.externalApp.update({where:{id:f.app},data:{active:false}});if(kind==="organization")await prisma.organization.update({where:{id:f.org},data:{active:false}});if(kind==="contract")await prisma.contract.update({where:{id:f.contract},data:{status:"INACTIVE"}});if(kind==="membership")await prisma.membership.delete({where:{userId_organizationId:{userId:f.user,organizationId:f.org}}});
  try{await expect(manifest()).rejects.toMatchObject({status:403});}finally{if(kind==="user")await prisma.user.update({where:{id:f.user},data:{active:true}});if(kind==="app")await prisma.externalApp.update({where:{id:f.app},data:{active:true}});if(kind==="organization")await prisma.organization.update({where:{id:f.org},data:{active:true}});if(kind==="contract")await prisma.contract.update({where:{id:f.contract},data:{status:"ACTIVE"}});if(kind==="membership")await prisma.membership.create({data:{userId:f.user,organizationId:f.org,role:"ADMIN"}});}
 });
 it("uses real Bearer/contract access on the new route and never returns a 304 or reusable token",async()=>{
  const app=await prisma.externalApp.findUniqueOrThrow({where:{id:f.app}}),user=await prisma.user.findUniqueOrThrow({where:{id:f.user}});const token=await signApiAccessToken({app,user});const url="http://localhost/api/v1/contracts/"+f.contract+"/offline/manifest?date="+day+"&month=2026-11";
  const denied=await GET(new Request(url),{params:Promise.resolve({contractId:f.contract})});expect(denied.status).toBe(401);
  const response=await GET(new Request(url,{headers:{Authorization:"Bearer "+token}}),{params:Promise.resolve({contractId:f.contract})});expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toBe("no-store");expect((await response.json()).data).toMatchObject({mode:"shadow",reuseAllowed:false});
 });
 it("detects disabled or replaced tracking code rather than attesting an unchanged database",async()=>{
  const intact=await manifest();await prisma.$executeRawUnsafe('ALTER TABLE "EntityRecord" DISABLE TRIGGER "opco_offline_revision_entityrecord_insert"');try{expect((await manifest()).manifestRevision).not.toBe(intact.manifestRevision);expect((await manifest()).tracking.databaseDml).toBe("incomplete");expect((await manifest()).reuseAllowed).toBe(false);}finally{await prisma.$executeRawUnsafe('ALTER TABLE "EntityRecord" ENABLE ALWAYS TRIGGER "opco_offline_revision_entityrecord_insert"');}
  expect((await manifest()).tracking.databaseDml).toBe("installed");
  const[fn]=await prisma.$queryRaw<Array<{definition:string}>>`SELECT pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=current_schema() AND p.proname='opco_offline_revision_touch'`;
  await prisma.$executeRawUnsafe('CREATE OR REPLACE FUNCTION opco_offline_revision_touch(p_schema TEXT,p_entities TEXT[]) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN RETURN; END; $$');
  try{expect((await manifest()).tracking.databaseDml).toBe("incomplete");expect((await manifest()).manifestRevision).not.toBe(intact.manifestRevision);}finally{await prisma.$executeRawUnsafe(fn.definition);}
  expect((await manifest()).tracking.databaseDml).toBe("installed");
 });
 it("supports raw SQL and actual COPY bulk changes, cascades and TRUNCATE rollback",async()=>{
  const temp=id("raw");await prisma.entityType.create({data:{id:temp,contractId:f.contract,name:temp,slug:temp}});await assertChange(temp,()=>prisma.$executeRaw`INSERT INTO "EntityRecord" (id,"entityTypeId","displayName","updatedAt") SELECT ${prefix}||'_raw_'||n,${temp},'Synthetic bulk',now() FROM generate_series(1,100) n`);
  await assertChange(temp,async()=>{execFileSync("/usr/bin/psql",["-X","-q","-v","ON_ERROR_STOP=1","-d",process.env.DATABASE_URL!.split("?")[0]],{input:'COPY "EntityRecord" (id,"entityTypeId","displayName","updatedAt") FROM STDIN WITH (FORMAT csv);\n'+id("copy_row")+','+temp+',Synthetic COPY,2026-11-11T12:00:00Z\n\\.\n',stdio:["pipe","pipe","pipe"]});});
  await assertChange(temp,()=>prisma.$executeRaw`UPDATE "EntityRecord" SET "displayName"='Synthetic updated' WHERE "entityTypeId"=${temp}`);await assertChange(temp,()=>prisma.entityType.delete({where:{id:temp}}));expect((await rawRevisions()).some(r=>r.entityTypeId===temp)).toBe(true);
  const before=await rawRevisions();await expect(prisma.$transaction(async tx=>{await tx.$executeRawUnsafe('TRUNCATE "EntityRelation"');throw Error("Synthetic truncate rollback");})).rejects.toThrow("Synthetic truncate rollback");expect(await rawRevisions()).toEqual(before);expect(await queued()).toBe(0);await assertChange(f.source,()=>prisma.$executeRawUnsafe('TRUNCATE "StateUpdateIdentitySlot"'));
 });
 it("tracks old and new contracts when a raw administrative move occurs",async()=>{
  const entity=id("moved");await prisma.entityType.create({data:{id:entity,contractId:f.contract,name:entity,slug:entity}});const old=await revision(entity);await prisma.entityType.update({where:{id:entity},data:{contractId:f.other}});
  expect(await revision(entity)).toBeGreaterThan(old);const[row]=await prisma.$queryRaw<Array<{rev:bigint}>>`SELECT "dataRevision" AS rev FROM "OfflineEntityRevision" WHERE "contractId"=${f.other} AND "entityTypeId"=${entity}`;expect(row.rev).toBeGreaterThan(BigInt(0));await prisma.entityType.delete({where:{id:entity}});
 });
 it("covers archived contract deletion without losing its revision tombstones",async()=>{
  const c=id("deleted_contract"),entity=id("deleted_type");await prisma.contract.create({data:{id:c,organizationId:f.org,name:c,code:c,slug:c}});await prisma.entityType.create({data:{id:entity,contractId:c,name:entity,slug:entity}});await prisma.entityRecord.create({data:{entityTypeId:entity,displayName:"Synthetic delete"}});
  const[before]=await prisma.$queryRaw<Array<{rev:bigint}>>`SELECT "dataRevision" AS rev FROM "OfflineEntityRevision" WHERE "contractId"=${c} AND "entityTypeId"=${entity}`;
  await archiveContractForAdmin(f.user,c);await deleteContractForAdmin(f.user,c,deleteContractConfirmationText(c));expect(await prisma.contract.findUnique({where:{id:c}})).toBeNull();const[after]=await prisma.$queryRaw<Array<{rev:bigint}>>`SELECT "dataRevision" AS rev FROM "OfflineEntityRevision" WHERE "contractId"=${c} AND "entityTypeId"=${entity}`;expect(after.rev).toBeGreaterThan(before.rev);
 });
 it("measures bounded manifest queries for 217 and 1000 subjects without scanning record contents",async()=>{
  const snapshots=[];for(const total of[217,1000]){const existing=await prisma.entityRecord.count({where:{entityTypeId:f.source}});if(existing<total)await prisma.entityRecord.createMany({data:Array.from({length:total-existing},(_,n)=>({id:id("scale"+total+"_"+n),entityTypeId:f.source,displayName:"Synthetic scale"}))});await drainQueryEvents();count=0;sqlMs=0;dataQueries=0;const start=performance.now();let value;for(let n=0;n<8;n++)value=await manifest();await drainQueryEvents();expect(dataQueries).toBe(0);snapshots.push({subjects:total,reads:8,postgresQueries:count,postgresStatementMs:sqlMs,businessRecordQueries:dataQueries,durationMs:performance.now()-start,payloadBytes:Buffer.byteLength(JSON.stringify(value))});}metrics.manifest=snapshots;expect(snapshots[1].postgresQueries).toBe(snapshots[0].postgresQueries);expect(await queued()).toBe(0);
 });
 it("measures write tracking overhead using disjoint synthetic batches and rotates the epoch after the disabled control",async()=>{
  const results=[];
  for(const[round,tracking]of[true,false,false,true].entries()){
   if(!tracking)await prisma.$executeRawUnsafe('ALTER TABLE "EntityRecord" DISABLE TRIGGER "opco_offline_revision_entityrecord_insert"');
   try{await drainQueryEvents();count=0;sqlMs=0;const start=performance.now();for(let batch=0;batch<8;batch++)await prisma.entityRecord.createMany({data:Array.from({length:100},(_,n)=>({id:id("bench_"+round+"_"+tracking+"_"+batch+"_"+n),entityTypeId:f.hidden,displayName:"Synthetic benchmark"}))});await drainQueryEvents();results.push({round,tracking,transactions:8,records:800,durationMs:performance.now()-start,postgresQueries:count,postgresStatementMs:sqlMs});}
   finally{if(!tracking){await prisma.$executeRawUnsafe('ALTER TABLE "EntityRecord" ENABLE ALWAYS TRIGGER "opco_offline_revision_entityrecord_insert"');await prisma.$executeRaw`UPDATE "OfflineRevisionEpoch" SET epoch=md5(random()::text||clock_timestamp()::text) WHERE id='v1'`;}}
  }
  metrics.bulkWrites=results;expect(await queued()).toBe(0);expect((await manifest()).tracking.databaseDml).toBe("installed");
 });

});
