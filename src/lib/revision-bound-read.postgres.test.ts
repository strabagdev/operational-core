import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { afterAll,beforeAll,describe,expect,it,vi } from "vitest";
import { prisma } from "./prisma";
import { createAppView,getAppViewInput } from "./app-views";
import { signApiAccessToken } from "./api-auth";
import { offlineManifestHash } from "./offline-manifest";
import { GET as manifestGET } from "../app/api/v1/contracts/[contractId]/offline/manifest/route";
import { revisionBoundRead } from "./revision-bound-read";
import { saveAttendanceWorkflowDay } from "./attendance-workflow";
import { saveStateUpdateWorkflow } from "./state-update-workflow";
import * as entities from "./api-entities";
import { GET as recordsGET } from "../app/api/v1/contracts/[contractId]/entities/[entityTypeId]/records/route";
import { GET as recordGET } from "../app/api/v1/contracts/[contractId]/entities/[entityTypeId]/records/[recordId]/route";
import { GET as definitionGET } from "../app/api/v1/contracts/[contractId]/entities/[entityTypeId]/route";
import { GET as entitiesGET } from "../app/api/v1/contracts/[contractId]/entities/route";
import { GET as viewsGET } from "../app/api/v1/contracts/[contractId]/views/route";
import { GET as attendanceGET } from "../app/api/v1/contracts/[contractId]/views/[appViewId]/workflow/attendance/route";
import { GET as stateGET } from "../app/api/v1/contracts/[contractId]/views/[appViewId]/workflow/state-update/route";
import { GET as panelGET } from "../app/api/v1/contracts/[contractId]/panels/[appViewId]/route";
import { GET as reportGET } from "../app/api/v1/contracts/[contractId]/reports/[appViewId]/route";
const suite=process.env.OFFLINE_REVISION_PG==="1"?describe.sequential:describe.skip;
const prefix="bound_"+randomUUID().replaceAll("-","").slice(0,10),id=(s:string)=>prefix+"_"+s;
const f={org:id("org"),app:id("app"),user:id("user"),member:id("member"),contract:id("contract"),other:id("other"),source:id("source"),flow:id("flow"),events:id("events"),catalog:id("catalog"),hidden:id("hidden"),text:id("text"),link:id("link"),person:id("person"),date:id("date"),status:id("status"),extra:id("extra"),choice:id("choice"),present:id("present"),absent:id("absent"),p1:id("p1"),p2:id("p2"),c1:id("c1"),c2:id("c2"),att:"",state:"",records:""};
const day="2026-11-11";
async function view(workflow:"attendance"|"state-update"){
 const form=new FormData();const target=workflow==="attendance"?f.flow:f.events,suffix=workflow==="attendance"?"":"e";
 for(const[k,v]of Object.entries({type:"WORKFLOW",workflowKey:workflow,name:"Synthetic "+workflow,slug:id(workflow).replaceAll("_","-"),active:"on",sourceEntityTypeId:f.source,targetEntityTypeId:target,personFieldId:f.person,subjectFieldId:f.person+suffix,dateFieldId:f.date+suffix,statusFieldId:f.status,defaultCheckInOptionId:f.present,uniquenessMode:"subject",historyMode:"append"}))form.set(k,v);
 if(workflow==="attendance")form.append("contextFieldIds",f.extra);else form.append("stateFieldIds",f.status+suffix);
 const v=await createAppView(f.contract,f.user,getAppViewInput(form));if(!v)throw Error("Synthetic view denied");await prisma.userAppViewAccess.create({data:{contractId:f.contract,userId:f.user,appViewId:v.id}});return v.id;
}

type Envelope={ok:boolean;data:Record<string,unknown>;error:{code:string};readRevision:{revision:string;manifestVectorRevision:string;selectionFingerprint:string;requestFingerprint:string;contentHash:string;mode:string;reuseAllowed:boolean;coverageCertified:boolean;snapshot:{isolation:string}}};
const read=(response:Response)=>response.json() as Promise<Envelope>;
let token="";const extra={panel:"",report:""};const timings:Array<{kind:string;seconds:number}>=[];
const request=(query:string,version=true,bearer=token)=>new Request("http://localhost/read?"+(version?"readRevisionVersion=1&":"")+query,{headers:{Authorization:"Bearer "+bearer}});
const records=(query="page=1&pageSize=1",version=true)=>recordsGET(request(query,version),{params:Promise.resolve({contractId:f.contract,entityTypeId:f.source})});
const attendance=(query="")=>attendanceGET(request("date="+day+"&personRecordId="+f.p1+query),{params:Promise.resolve({contractId:f.contract,appViewId:f.att})});
const state=(query="")=>stateGET(request("date="+day+query),{params:Promise.resolve({contractId:f.contract,appViewId:f.state})});
const panel=(query="page=1&pageSize=1")=>panelGET(request(query),{params:Promise.resolve({contractId:f.contract,appViewId:extra.panel})});
const report=()=>reportGET(request("from="+day+"&to="+day),{params:Promise.resolve({contractId:f.contract,appViewId:extra.report})});
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};}
suite("revision-bound business reads on isolated PostgreSQL",()=>{
 beforeAll(async()=>{
  const u=new URL(process.env.DATABASE_URL??"");if(u.hostname!=="127.0.0.1"||u.port!=="19543"||u.pathname!=="/opco_revision_shadow")throw Error("ISOLATED_REVISION_DATABASE_REQUIRED");
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

  await prisma.entityValue.createMany({data:[{entityRecordId:f.p1,entityFieldId:f.text,textValue:"001"},{entityRecordId:f.p2,entityFieldId:f.text,textValue:"002"}]});
  await prisma.entityRelation.create({data:{sourceFieldId:f.link,sourceRecordId:f.p1,targetRecordId:f.c1}});
  for(const [key,type,config] of [
    ["panel","PANEL",{schemaVersion:1,layout:{columns:12},filters:[],datasets:[{id:"rows",source:{type:"ENTITY",entityTypeId:f.source},filters:[],sort:[],transformation:{type:"RECORDS",fieldIds:[f.text,f.link],pagination:{pageSize:1}}}],metrics:[],calculatedFields:[],modules:[{id:"table",datasetId:"rows",visualization:{type:"TABLE",config:{columns:[{fieldId:f.text},{fieldId:f.link}],paginated:true,searchable:true}},layout:{x:0,y:0,w:12,h:6}}]}],
    ["report","REPORT",{entityTypeId:f.flow,dateFieldId:f.date,presentationMode:"TABLE",table:{visibleFieldIds:[f.person,f.status,f.date,f.extra],defaultSortFieldId:f.date,defaultSortDirection:"asc"}}]
  ] as const){const row=await prisma.appView.create({data:{contractId:f.contract,name:"Synthetic "+key,slug:id(key),type,config}});extra[key]=row.id;await prisma.userAppViewAccess.create({data:{contractId:f.contract,appViewId:row.id,userId:f.user}});}
  const app=await prisma.externalApp.findUniqueOrThrow({where:{id:f.app}}),user=await prisma.user.findUniqueOrThrow({where:{id:f.user}});token=await signApiAccessToken({app,user});
  expect(await saveAttendanceWorkflowDay({appId:f.app,appViewId:f.att,contractId:f.contract,userId:f.user,body:{clientRequestId:id("initial-att"),date:day,entries:[{personRecordId:f.p1,statusOptionId:f.present,contextValues:{[f.extra]:f.c1}}]}})).toMatchObject({ok:true});
  expect(await saveStateUpdateWorkflow({appId:f.app,appViewId:f.state,contractId:f.contract,userId:f.user,body:{clientRequestId:id("initial-state"),subjectRecordId:f.p1,date:day,states:{[f.status+"e"]:f.present+"e"}}})).toMatchObject({ok:true});
 });
 afterAll(async()=>{vi.restoreAllMocks();if(process.env.REVISION_READ_METRICS)writeFileSync(process.env.REVISION_READ_METRICS,JSON.stringify(timings,null,2));await prisma.$disconnect();});

 it("seals all nine endpoint families and preserves the legacy RECORDS data DTO",async()=>{
  const pairs=[
   ["records",()=>records()], ["record",()=>recordGET(request(""),{params:Promise.resolve({contractId:f.contract,entityTypeId:f.source,recordId:f.p1})})],
   ["definition",()=>definitionGET(request(""),{params:Promise.resolve({contractId:f.contract,entityTypeId:f.source})})],
   ["entities",()=>entitiesGET(request(""),{params:Promise.resolve({contractId:f.contract})})],
   ["views",()=>viewsGET(request(""),{params:Promise.resolve({contractId:f.contract})})],
   ["attendance",()=>attendance()],["state-update",()=>state()],["panel",()=>panel()],["report",()=>report()]
  ] as const;
  for(const[kind,run]of pairs){const t=performance.now(),response=await run();timings.push({kind,seconds:(performance.now()-t)/1000});const body=await read(response);expect(response.status,kind+" "+JSON.stringify(body)).toBe(200);expect(body.readRevision).toMatchObject({version:1,mode:"shadow",reuseAllowed:false,coverageCertified:false,snapshot:{isolation:"repeatable-read"}});expect(body.readRevision.contentHash).toBe(offlineManifestHash(body.data));expect(response.headers.get("cache-control")).toBe("no-store");}
  const legacy=await read(await records("page=1&pageSize=1",false)),bound=await read(await records());expect(legacy.readRevision).toBeUndefined();expect(bound.data).toEqual(legacy.data);
 });
 it("keeps page contents/count and revision on the old snapshot during a concurrent writer",async()=>{
  const prior=await read(await records("page=1&pageSize=100")),entered=deferred(),resume=deferred();const original=entities.getApiEntityDefinition;
  const spy=vi.spyOn(entities,"getApiEntityDefinition").mockImplementationOnce(async(...args)=>{const definition=await original(...args);entered.resolve();await resume.promise;return definition;});
  const pending=records("page=1&pageSize=100");await entered.promise;
  try{await prisma.$transaction(async tx=>{await tx.entityRecord.update({where:{id:f.p1},data:{displayName:"Synthetic after concurrent write"}});await tx.entityField.update({where:{id:f.text},data:{key:"text_later"}});});}finally{resume.resolve();}
  const response=await read(await pending);spy.mockRestore();expect(response.data).toEqual(prior.data);expect(response.readRevision.revision).toBe(prior.readRevision.revision);const next=await read(await records("page=1&pageSize=100"));expect(next.readRevision.revision).not.toBe(prior.readRevision.revision);expect(next.data).not.toEqual(prior.data);
 });
 it("requires an expected revision after page one and accepts unchanged pages",async()=>{
  const first=await read(await records());expect((await records("page=2&pageSize=1")).status).toBe(409);
  const second=await records("page=2&pageSize=1&expectedReadRevision="+first.readRevision.revision);expect(second.status).toBe(200);const body=await read(second);expect(body.readRevision.revision).toBe(first.readRevision.revision);expect(body.readRevision.requestFingerprint).not.toBe(first.readRevision.requestFingerprint);
 });
 it("rejects mixed pages after deletion without returning a partial success",async()=>{
  const row=await prisma.entityRecord.create({data:{entityTypeId:f.source,displayName:"Synthetic temporary page"}});const first=await read(await records());await prisma.entityRecord.delete({where:{id:row.id}});
  const response=await records("page=2&pageSize=1&expectedReadRevision="+first.readRevision.revision);expect(response.status).toBe(409);const body=await read(response);expect(body.error.code).toBe("READ_REVISION_CHANGED");expect(body.readRevision).toBeUndefined();expect(body.data).toBeUndefined();
 });
 it("detects relation target labels and relation removal for all dependent readers",async()=>{
  const a=await read(await records()),att=await read(await attendance()),r=await read(await report());await prisma.entityRecord.update({where:{id:f.c1},data:{displayName:"Synthetic relation label changed"}});
  expect((await read(await records())).readRevision.revision).not.toBe(a.readRevision.revision);expect((await read(await attendance())).readRevision.revision).not.toBe(att.readRevision.revision);expect((await read(await report())).readRevision.revision).not.toBe(r.readRevision.revision);
  const before=await read(await records());await prisma.entityRelation.deleteMany({where:{sourceRecordId:f.p1,sourceFieldId:f.link}});expect((await read(await records())).readRevision.revision).not.toBe(before.readRevision.revision);
 });
 it("detects metadata/SELECT changes independent of parent updatedAt",async()=>{
  const a=await read(await attendance()),field=await prisma.entityField.findUniqueOrThrow({where:{id:f.status}});await prisma.fieldOption.update({where:{id:f.present},data:{label:"Synthetic option renamed"}});expect((await prisma.entityField.findUniqueOrThrow({where:{id:f.status}})).updatedAt).toEqual(field.updatedAt);expect((await read(await attendance())).readRevision.revision).not.toBe(a.readRevision.revision);
 });
 it("binds query/filter/search/pageSize and refuses a revision from another selection",async()=>{
  const a=await read(await records());const changed=await records("page=2&pageSize=2&expectedReadRevision="+a.readRevision.revision);expect(changed.status).toBe(409);
  const p=await read(await panel());expect((await panel("page=2&pageSize=1&search=other&expectedReadRevision="+p.readRevision.revision)).status).toBe(409);
 });
 it("seals explicit current event/null and keeps separate batches on one revision",async()=>{
  const bootstrap=await read(await state()),caps=bootstrap.data.currentBatchCapabilities as{configurationFingerprint:string};
  const query="&currentBatchVersion=1&currentBatchFingerprint="+caps.configurationFingerprint+"&subjectRecordIds=";
  const a=await read(await state(query+f.p1)),b=await read(await state(query+f.p2));expect(a.readRevision.revision).toBe(b.readRevision.revision);expect(a.readRevision.requestFingerprint).not.toBe(b.readRevision.requestFingerprint);expect(b.data.subjects).toEqual([expect.objectContaining({current:null})]);
 });
 it("does not certify per-subject current errors as complete coverage",async()=>{
  const bootstrap=await read(await state()),caps=bootstrap.data.currentBatchCapabilities as{configurationFingerprint:string};const body=await read(await state("&currentBatchVersion=1&currentBatchFingerprint="+caps.configurationFingerprint+"&subjectRecordIds="+id("absent")));expect(body.data.currentBatch).toMatchObject({results:[{subjectRecordId:id("absent"),status:"error",code:"SUBJECT_UNAVAILABLE"}]});expect(body.readRevision.coverageCertified).toBe(false);
 });
 it("keeps a rolled-back mutation and deferred revision invisible to readers",async()=>{
  const old=await read(await records()),entered=deferred(),resume=deferred();const write=prisma.$transaction(async tx=>{await tx.entityRecord.update({where:{id:f.p1},data:{displayName:"Synthetic rolled back"}});entered.resolve();await resume.promise;throw Error("rollback");});await entered.promise;const during=await read(await records());resume.resolve();await expect(write).rejects.toThrow("rollback");const after=await read(await records());expect(during.readRevision.revision).toBe(old.readRevision.revision);expect(after.readRevision.revision).toBe(old.readRevision.revision);expect(after.data).toEqual(old.data);
 });
 it("sees data and its deferred revision together after concurrent transaction commit",async()=>{
  const old=await read(await records()),entered=deferred(),resume=deferred();const write=prisma.$transaction(async tx=>{await tx.entityValue.updateMany({where:{entityRecordId:f.p2,entityFieldId:f.text},data:{textValue:"003"}});entered.resolve();await resume.promise;});await entered.promise;expect((await read(await records())).readRevision.revision).toBe(old.readRevision.revision);resume.resolve();await write;expect((await read(await records())).readRevision.revision).not.toBe(old.readRevision.revision);
 });
 it("isolates user/contract scopes and rejects revoked AppView assignment",async()=>{
  const first=await read(await attendance());await prisma.userAppViewAccess.deleteMany({where:{appViewId:f.att,userId:f.user}});try{expect((await attendance()).status).toBe(403);}finally{await prisma.userAppViewAccess.create({data:{contractId:f.contract,userId:f.user,appViewId:f.att}});}
  expect(first.readRevision.revision).not.toBe("");const other=await recordsGET(request(""),{params:Promise.resolve({contractId:f.other,entityTypeId:f.source})});expect(other.status).toBe(404);
  const member=await prisma.user.findUniqueOrThrow({where:{id:f.member}}),app=await prisma.externalApp.findUniqueOrThrow({where:{id:f.app}});const otherToken=await signApiAccessToken({app,user:member});const response=await recordsGET(request("page=1&pageSize=1",true,otherToken),{params:Promise.resolve({contractId:f.contract,entityTypeId:f.source})});expect(response.status).toBe(200);expect((await read(response)).readRevision.revision).not.toBe((await read(await records())).readRevision.revision);
 });
 it("pins concurrent authorization revocation to the read snapshot; rejects the next read",async()=>{
  const prior=await read(await records()),entered=deferred(),resume=deferred(),original=entities.getApiEntityDefinition;
  const spy=vi.spyOn(entities,"getApiEntityDefinition").mockImplementationOnce(async(...args)=>{const definition=await original(...args);entered.resolve();await resume.promise;return definition;});const pending=records();await entered.promise;
  try{await prisma.user.update({where:{id:f.user},data:{active:false}});resume.resolve();const current=await pending;expect(current.status).toBe(200);expect((await read(current)).readRevision.revision).toBe(prior.readRevision.revision);expect((await records()).status).toBe(401);}finally{resume.resolve();spy.mockRestore();await prisma.user.update({where:{id:f.user},data:{active:true}});}
 });
 it("changes revision on a role change and rejects a now-inactive contract",async()=>{
  const old=await read(await records());await prisma.membership.update({where:{userId_organizationId:{userId:f.user,organizationId:f.org}},data:{role:"MEMBER"}});try{expect((await read(await records())).readRevision.revision).not.toBe(old.readRevision.revision);}finally{await prisma.membership.update({where:{userId_organizationId:{userId:f.user,organizationId:f.org}},data:{role:"ADMIN"}});}
  await prisma.contract.update({where:{id:f.contract},data:{status:"ARCHIVED"}});try{expect((await records()).status).toBe(404);}finally{await prisma.contract.update({where:{id:f.contract},data:{status:"ACTIVE"}});}
 });
 it("cannot write from a revision read scope or escape to another transaction",async()=>{
  const response=await revisionBoundRead(request(""),{kind:"records",contractId:f.contract,entityTypeId:f.source},async()=>{await prisma.entityRecord.create({data:{id:id("illegal-write"),entityTypeId:f.source,displayName:"Must not persist"}});return Response.json({ok:true,data:{}});});expect(response.status).toBe(503);expect(await prisma.entityRecord.findUnique({where:{id:id("illegal-write")}})).toBeNull();
 });
 it("fails explicitly on unavailable tracking without changing unversioned reads",async()=>{
  await prisma.$executeRawUnsafe('ALTER TABLE "EntityRecord" DISABLE TRIGGER opco_offline_revision_entityrecord_update');try{expect((await records()).status).toBe(503);expect((await records("page=1&pageSize=1",false)).status).toBe(200);}finally{await prisma.$executeRawUnsafe('ALTER TABLE "EntityRecord" ENABLE ALWAYS TRIGGER opco_offline_revision_entityrecord_update');await prisma.$executeRaw`UPDATE "OfflineRevisionEpoch" SET epoch=md5(random()::text)`;}
 });
 it("propagates domain errors without a success seal and does not retry",async()=>{
  const response=await records("page=1&sort=unknown");expect(response.status).toBe(400);expect((await read(response)).readRevision).toBeUndefined();
 });
 it.each(["MATRIX","CURRENT_STATUS","LATEST_BY_RELATION"] as const)("seals existing REPORT %s without modifying its calculation or projection",async mode=>{
  const saved=await prisma.appView.findUniqueOrThrow({where:{id:extra.report}});
  const config=mode==="MATRIX"?{entityTypeId:f.flow,dateFieldId:f.date,presentationMode:mode,matrix:{rowFieldId:f.person,columnFieldId:f.date,valueFieldId:f.status,summaryFieldId:f.status}}
   :mode==="CURRENT_STATUS"?{entityTypeId:f.flow,presentationMode:mode,currentStatus:{subjectFieldId:f.person,stateFieldId:f.status,dateFieldId:f.date,displayFieldIds:[f.person,f.status,f.date]}}
   :{entityTypeId:f.flow,presentationMode:mode,latestByRelation:{relatedEntityTypeId:f.source,relationFieldId:f.person,orderFieldId:f.date,requiredValueFieldId:f.status,displayFieldIds:[f.person,f.status,f.date]}};
  try{await prisma.appView.update({where:{id:extra.report},data:{config}});const sealed=await report();const body=await read(sealed);expect(sealed.status,JSON.stringify(body)).toBe(200);
    const legacy=await reportGET(request("from="+day+"&to="+day,false),{params:Promise.resolve({contractId:f.contract,appViewId:extra.report})});expect(legacy.status).toBe(200);expect(body.data).toEqual((await read(legacy)).data);
  }finally{await prisma.appView.update({where:{id:extra.report},data:{config:saved.config!}});}
 });
 it("tracks a REPORT's unassigned backing STATE_UPDATE data and definition",async()=>{
  const saved=await prisma.appView.findUniqueOrThrow({where:{id:extra.report}}),workflow=await prisma.appView.findUniqueOrThrow({where:{id:f.state}});
  await prisma.userAppViewAccess.deleteMany({where:{userId:f.user,appViewId:f.state}});
  try{await prisma.appView.update({where:{id:extra.report},data:{config:{sourceMode:"STATE_UPDATE",stateUpdateAppViewId:f.state,projection:"CURRENT",presentationMode:"TABLE",table:{visibleFieldIds:["subject.displayName","state:"+f.status+"e"]}}}});
    const first=await report();expect(first.status,JSON.stringify(await first.clone().json())).toBe(200);const a=await read(first);
    const row=await prisma.entityRecord.findFirstOrThrow({where:{entityTypeId:f.events}});await prisma.entityValue.updateMany({where:{entityRecordId:row.id,entityFieldId:f.status+"e"},data:{textValue:"b"}});
    const b=await read(await report());expect(b.readRevision.revision).not.toBe(a.readRevision.revision);expect(b.data).not.toEqual(a.data);
    await prisma.appView.update({where:{id:f.state},data:{name:"Synthetic backing definition changed"}});expect((await read(await report())).readRevision.revision).not.toBe(b.readRevision.revision);
  }finally{await prisma.appView.update({where:{id:extra.report},data:{config:saved.config!}});await prisma.appView.update({where:{id:f.state},data:{name:workflow.name}});await prisma.userAppViewAccess.create({data:{contractId:f.contract,userId:f.user,appViewId:f.state}});}
 });
 it("never falls back to root for an asynchronous query retained past snapshot closure",async()=>{
  const release=deferred();let late:Promise<unknown>|undefined;
  const response=await revisionBoundRead(request(""),{kind:"records",contractId:f.contract,entityTypeId:f.source},async()=>{
    late=(async()=>{await release.promise;return prisma.entityRecord.findMany({where:{entityTypeId:f.source}});})();return Response.json({ok:true,data:{synthetic:true}});
  });expect(response.status).toBe(200);release.resolve();await expect(late!).rejects.toThrow();
 });
 it("retains a consistent empty result as a sealed result, without certifying collection coverage",async()=>{
  const response=await records("page=1&pageSize=1&search=synthetic-no-such-query"),body=await read(response);expect(response.status).toBe(200);expect(body.data.records).toEqual([]);expect(body.data.pagination).toMatchObject({total:0});expect(body.readRevision.coverageCertified).toBe(false);
 });

 it("binds business reads to the same vector publicly returned by the shadow manifest",async()=>{
  const response=await manifestGET(new Request("http://localhost/manifest?version=1&date="+day,{headers:{Authorization:"Bearer "+token}}),{params:Promise.resolve({contractId:f.contract})});expect(response.status).toBe(200);const manifest=await response.json();const record=await read(await records()),att=await read(await attendance()),panelRead=await read(await panel());
  expect(manifest.data.mode).toBe("shadow");expect(manifest.data.reuseAllowed).toBe(false);expect(record.readRevision.manifestVectorRevision).toBe(manifest.data.readBindingVector.revision);expect(att.readRevision.manifestVectorRevision).toBe(manifest.data.readBindingVector.revision);expect(panelRead.readRevision.manifestVectorRevision).toBe(manifest.data.readBindingVector.revision);
 });

 it("refuses a revision seal for a stored relation that crosses the authorized contract",async()=>{
  const foreign=await prisma.entityType.create({data:{contractId:f.other,name:"Synthetic foreign source",slug:id("foreign-type")}}),target=await prisma.entityRecord.create({data:{entityTypeId:foreign.id,displayName:"Synthetic foreign label"}});
  const relation=await prisma.entityRelation.create({data:{sourceRecordId:f.p1,sourceFieldId:f.link,targetRecordId:target.id}});
  try{const response=await records("page=1&pageSize=100");expect(response.status).toBe(503);expect((await read(response)).error.code).toBe("READ_REVISION_DEPENDENCIES_UNAVAILABLE");}
  finally{await prisma.entityRelation.delete({where:{id:relation.id}});await prisma.entityRecord.delete({where:{id:target.id}});await prisma.entityType.delete({where:{id:foreign.id}});}
 });

});
