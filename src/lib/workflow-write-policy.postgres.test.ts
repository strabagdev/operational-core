import {deleteContractForAdmin} from "./contract-admin";
import {deleteContractConfirmationText} from "./contract-deletion";
import {getEntityFieldInput,updateEntityField} from "./entity-config";
import {POST as genericPOST} from "../app/api/v1/contracts/[contractId]/entities/[entityTypeId]/records/route";
import {PATCH as genericPATCH} from "../app/api/v1/contracts/[contractId]/entities/[entityTypeId]/records/[recordId]/route";
import {POST as statePOST} from "../app/api/v1/contracts/[contractId]/views/[appViewId]/workflow/state-update/route";
vi.mock("./api-auth",()=>({requireApiContractAccess:vi.fn(async(request:Request,contractId:string)=>{
 if(contractId!==f.contract)return{ok:false,response:new Response(null,{status:403})};
 return{ok:true,context:{app:{id:f.app,organizationId:f.org},contract:{id:f.contract},user:{id:request.headers.get("x-synthetic-role")==="member"?f.denied:f.user},membership:{role:"ADMIN"}}};
})}));
import {workflowWriteMetadata,assertGenericEntityWritesAllowed, type WorkflowWritePolicy} from "./workflow-write-policy";
import {createApiEntityRecord,patchApiEntityRecord} from "./api-record-writes";
import {getApiEntityDefinition} from "./api-entities";
import {importEntityRecords} from "./entity-import";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "./prisma";
import { createEntityRecord, updateEntityRecord, deleteEntityRecordsPermanently, deleteRecordsConfirmationText } from "./entity-records";
import { fieldInputName } from "./field-validation";
import { createAppView, updateAppView, getAppViewInput, setAppViewActive } from "./app-views";
import { saveAttendanceWorkflowDay } from "./attendance-workflow";
import { attendanceStateUpdateConfig, getStateUpdateContextForConfig, saveStateUpdateEntry, saveStateUpdateWorkflow } from "./state-update-workflow";

const suite = process.env.WORKFLOW_WRITE_GUARDS_PG === "1" ? describe.sequential : describe.skip;
const prefix = "write_guards_" + randomUUID().replaceAll("-", "").slice(0, 12);
const id = (key: string) => prefix + "_" + key;
const f = Object.fromEntries(["org", "user", "denied", "contract", "source", "target", "catalog", "subject", "date", "status", "choice", "relation", "observation", "a", "b", "c", "one", "lot1", "lot2", "app"].map(key => [key, id(key)]));
const people = Array.from({ length: 24 }, (_, i) => id("person" + i));
const day = "2026-11-03";
let view = "", otherView = "", validated = false;
let pausedShared:Awaited<ReturnType<typeof protectedBody>>,pausedLegacy:Record<string,unknown>;
let legacyGenericRequest:Record<string,unknown>;let legacyGenericRecordId:string;
const config = () => ({ sourceEntityTypeId: f.source, targetEntityTypeId: f.target, personFieldId: f.subject, dateFieldId: f.date, statusFieldId: f.status, defaultCheckInOptionId: f.a, contextFieldIds: [f.choice, f.relation], observationFieldId: f.observation });
const body = (key: string, person = people[0], change: Record<string, unknown> = {}) => ({ clientRequestId: id(key), subjectRecordId: person, date: day, states: { [f.status]: f.a }, extraValues: { [f.choice]: "one", [f.relation]: f.lot1, [f.observation]: "Synthetic observation" }, ...change });
const save = (command: ReturnType<typeof body>, appViewId = view, userId = f.user) => saveStateUpdateWorkflow({ appId: f.app, appViewId, contractId: f.contract, userId, body: command });
function result(response: Awaited<ReturnType<typeof save>>) { if (!response.ok) throw Error("Synthetic request rejected"); return response.data.result; }
async function rows(person: string, date = day) { return prisma.entityRecord.findMany({ where: { entityTypeId: f.target, outgoingRelations: { some: { sourceFieldId: f.subject, targetRecordId: person } }, values: { some: { entityFieldId: f.date, dateValue: new Date(date + "T00:00:00Z") } } }, include: { outgoingRelations: true, values: true } }); }

function form(policy?:WorkflowWritePolicy, disarm=false) { const value=new FormData();
 for(const [key,v] of Object.entries({...config(),type:"WORKFLOW",workflowKey:"attendance",name:id("view"),slug:id("view").replaceAll("_","-"),active:"on"}))if(typeof v==="string")value.set(key,v);
 for(const field of config().contextFieldIds)value.append("contextFieldIds",field);
 value.set("workflowWritePolicy",policy?JSON.stringify(policy):"");if(disarm)value.set("workflowWritePolicyDisarm","DESARMAR");return value;
}
const policy=(acceptNewCommands=true):WorkflowWritePolicy=>({version:1,mode:"workflow-only",acceptNewCommands,allowedAppViewIds:[view,otherView]});
async function configure(open=true){return updateAppView(f.contract,view,f.user,getAppViewInput(form(policy(open))));}
async function cap(appViewId=view){const metadata=await workflowWriteMetadata(f.target,appViewId);if(!metadata.workflowWriteContract)throw Error("No policy");return{version:1 as const,configurationFingerprint:metadata.workflowWriteContract.configurationFingerprint,capabilities:["relation-context-v1"] as ["relation-context-v1"]};}
async function protectedBody(key:string,person=people[0],change:Record<string,unknown>={},appViewId=view){return body(key,person,{writeCommand:await cap(appViewId),...change});}
const recordForm=(person=people[0])=>{const data=new FormData();for(const[key,value]of Object.entries({[f.subject]:person,[f.date]:day,[f.status]:"a",[f.choice]:"one",[f.relation]:f.lot1}))data.set(fieldInputName(key),value);return data;};
async function pristine(person:string){const [record]=await rows(person);return{record,audits:await prisma.auditEvent.count({where:{entityRecordId:record.id}})};}

suite("opt-in write gates on validated local PostgreSQL", () => {
 beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (url.hostname !== "127.0.0.1" || url.port !== "5432" || url.pathname !== "/opco_development" || decodeURIComponent(url.username) !== "opco_dev") throw Error("LOCAL_DATABASE_REQUIRED");
  const [connection] = await prisma.$queryRaw<Array<{ database: string; role: string; address: string }>>`SELECT current_database() AS database,current_user AS role,inet_server_addr()::text AS address`;
  expect(connection).toEqual({ database: "opco_development", role: "opco_dev", address: "127.0.0.1/32" }); validated = true;
  await prisma.organization.create({ data: { id: f.org, name: "Synthetic write identity", slug: f.org } });
  for (const user of [f.user, f.denied]) { await prisma.user.create({ data: { id: user, email: user + "@example.invalid", passwordHash: "no-login-synthetic" } }); await prisma.membership.create({ data: { userId: user, organizationId: f.org, role: user === f.user ? "ADMIN" : "MEMBER" } }); }
  await prisma.contract.create({ data: { id: f.contract, organizationId: f.org, name: "Synthetic contract", code: f.contract, slug: f.contract } });
  await prisma.externalApp.create({ data: { id: f.app, organizationId: f.org, name: "Synthetic app", clientId: id("client"), slug: f.app } });
  await prisma.entityType.createMany({ data: [f.source, f.target, f.catalog].map(entity => ({ id: entity, contractId: f.contract, name: entity, slug: entity, nature: entity === f.target ? "TRANSACTION" : "MASTER" })) });
  for (const field of [
   { id: f.subject, key: "subject", type: "RELATION" as const, required: true, config: { targetEntityTypeId: f.source, relationKind: "ONE" } },
   { id: f.date, key: "date", type: "DATE" as const, required: true, config: {} },
   { id: f.status, key: "state", type: "SELECT" as const, required: true, config: {} },
   { id: f.choice, key: "choice", type: "SELECT" as const, required: true, config: {} },
   { id: f.relation, key: "relation", type: "RELATION" as const, required: true, config: { targetEntityTypeId: f.catalog, relationKind: "ONE", display: {primary:true} } },
   { id: f.observation, key: "observation", type: "TEXTAREA" as const, required: false, config: {} },
  ]) await prisma.entityField.create({ data: { ...field, name: field.key, entityTypeId: f.target } });
  await prisma.fieldOption.createMany({ data: [{ id: f.a, entityFieldId: f.status, label: "A", value: "a" }, { id: f.b, entityFieldId: f.status, label: "B", value: "b" }, { id: f.c, entityFieldId: f.status, label: "C", value: "c" }, { id: f.one, entityFieldId: f.choice, label: "One", value: "one" }] });
  await prisma.entityRecord.createMany({ data: [...people.map(person => ({ id: person, entityTypeId: f.source, displayName: "Synthetic subject" })), ...[f.lot1, f.lot2].map(lot => ({ id: lot, entityTypeId: f.catalog, displayName: "Synthetic catalog" }))] });
  for (const key of ["view", "other_view"]) {
   const form = new FormData();
   for (const [k, value] of Object.entries({ ...config(), type: "WORKFLOW", workflowKey: "attendance", name: id(key), slug: id(key).replaceAll("_", "-"), active: "on" })) if (typeof value === "string") form.set(k, value);
   for (const field of config().contextFieldIds) form.append("contextFieldIds", field);
   const appView = await createAppView(f.contract, f.user, getAppViewInput(form)); if (!appView) throw Error("Synthetic view rejected");
   await prisma.userAppViewAccess.create({ data: { appViewId: appView.id, userId: f.user, contractId: f.contract } });
   if (key === "view") view = appView.id; else otherView = appView.id;
  }
 });
 afterAll(async () => {
  vi.restoreAllMocks();
  if (validated) { await prisma.apiIdempotencyKey.deleteMany({ where: { contractId: f.contract } }); await prisma.auditEvent.deleteMany({ where: { contractId: f.contract } }); await prisma.entityRelation.deleteMany({ where: { sourceRecord: { entityType: { contractId: f.contract } } } }); await prisma.organization.deleteMany({ where: { id: f.org } }); await prisma.user.deleteMany({ where: { id: { in: [f.user, f.denied] } } }); expect(await prisma.organization.count({where:{id:f.org}})).toBe(0);expect(await prisma.entityRecord.count({where:{entityType:{contractId:f.contract}}})).toBe(0); }
  await prisma.$disconnect();
 });
 it("preserves the exact completed replay when protection is armed and paused",async()=>{
  const command=body("old_completed",people[0]);const first=result(await save(command));expect(first.result).toBe("CREATED");
  const entity=await getApiEntityDefinition(f.contract,f.target);if(!entity)throw Error("No entity");
  legacyGenericRequest={clientRequestId:id("legacy_generic"),values:{subject:people[20],date:day,state:"a",choice:"one",relation:f.lot1}};
  const previousGeneric=await createApiEntityRecord({appId:f.app,contractId:f.contract,userId:f.user,entity,body:legacyGenericRequest});if(!previousGeneric.ok)throw Error("No generic receipt");legacyGenericRecordId=previousGeneric.recordId;
  let release!:()=>void,locked!:()=>void;const acquired=new Promise<void>(resolve=>{locked=resolve;});const hold=new Promise<void>(resolve=>{release=resolve;});
  const inFlight=prisma.$transaction(async tx=>{await assertGenericEntityWritesAllowed(tx,[f.target]);locked();await hold;});
  await acquired;let activated=false;const activation=configure(false).then(r=>{activated=true;return r;});
  try {await new Promise(resolve=>setTimeout(resolve,40));expect(activated).toBe(false);}finally{release();await inFlight;await activation;}
  expect((await workflowWriteMetadata(f.target,view)).workflowWriteContract).toMatchObject({authorized:true,acceptNewCommands:false});
  expect(result(await save(command))).toEqual(first);expect(await rows(people[0])).toHaveLength(1);
  pausedShared=await protectedBody("paused_same_key",people[21]);
  expect(result(await save(pausedShared))).toMatchObject({result:"ERROR",code:"WORKFLOW_WRITES_PAUSED"});
  pausedLegacy={clientRequestId:id("paused_legacy_key"),date:day,entries:[{personRecordId:people[22],statusOptionId:f.a,writeCommand:await cap(otherView),contextValues:{[f.choice]:f.one,[f.relation]:f.lot1}}]};
  const legacyPaused=await saveAttendanceWorkflowDay({appId:f.app,appViewId:otherView,contractId:f.contract,userId:f.user,body:pausedLegacy});expect(legacyPaused.ok).toBe(true);if(legacyPaused.ok)expect(legacyPaused.data.results[0]).toMatchObject({result:"ERROR",code:"WORKFLOW_WRITES_PAUSED"});
  expect(await rows(people[21])).toHaveLength(0);expect(await rows(people[22])).toHaveLength(0);
 });
 it("rejects old commands for new and existing rows, including overwrite with a valid base",async()=>{
  await configure();const before=await pristine(people[0]);
  expect(result(await save(body("old_new",people[1])))).toMatchObject({result:"ERROR",code:"WORKFLOW_COMMAND_INCOMPATIBLE"});
  expect(result(await save(body("old_edit",people[0],{overwrite:true,expectedUpdatedAt:before.record.updatedAt.toISOString(),states:{[f.status]:f.b}})))).toMatchObject({result:"ERROR",code:"WORKFLOW_COMMAND_INCOMPATIBLE"});
  expect(await pristine(people[0])).toEqual(before);expect(await rows(people[1])).toHaveLength(0);
 });
 it("retries a never-executed paused command with its original key after resume",async()=>{
  const shared=await save(pausedShared);expect(shared.ok).toBe(true);if(shared.ok)expect(shared.data.result.result).toBe("CREATED");
  const legacy=await saveAttendanceWorkflowDay({appId:f.app,appViewId:otherView,contractId:f.contract,userId:f.user,body:pausedLegacy});expect(legacy.ok).toBe(true);if(legacy.ok)expect(legacy.data.results[0].result).toBe("CREATED");
  expect(await rows(people[21])).toHaveLength(1);expect(await rows(people[22])).toHaveLength(1);
 });
 it("accepts a compatible command once and replays the same capability receipt",async()=>{
  const command=await protectedBody("new_replay",people[1]);const first=result(await save(command));expect(first).toMatchObject({result:"CREATED",writeCommand:await cap()});
  expect(result(await save(command))).toEqual(first);expect(await rows(people[1])).toHaveLength(1);
  expect(await prisma.auditEvent.count({where:{entityRecordId:(first as {recordId:string}).recordId,action:"RECORD_CREATED"}})).toBe(1);
  const mismatch=await save({...command,states:{[f.status]:f.b}});expect(mismatch.ok).toBe(false);
 });
 it("requires explicit nonempty context even when a valid relation already exists",async()=>{
  const before=await pristine(people[1]);
  for(const [key,extraValues]of Object.entries({missing:{[f.choice]:"one"},empty:{[f.choice]:"one",[f.relation]:null}})) {
   const command=await protectedBody("context_"+key,people[1],{extraValues,overwrite:true,expectedUpdatedAt:before.record.updatedAt.toISOString(),states:{[f.status]:f.b}});
   expect(result(await save(command))).toMatchObject({result:"ERROR",code:"WORKFLOW_CONTEXT_REQUIRED"});
  }
  expect(await pristine(people[1])).toEqual(before);
 });
 it("serializes authorized Attendance and STATE_UPDATE requests without duplicate rows",async()=>{
  const commands=await Promise.all(Array.from({length:3},(_,i)=>protectedBody("parallel_"+i,people[2],{},i%2?otherView:view)));
  const legacy=saveAttendanceWorkflowDay({appId:f.app,appViewId:otherView,contractId:f.contract,userId:f.user,body:{clientRequestId:id("legacy"),date:day,entries:[{personRecordId:people[2],statusOptionId:f.a,writeCommand:await cap(otherView),contextValues:{[f.choice]:f.one,[f.relation]:f.lot1},observation:"Synthetic observation"}]}});
  const responses=await Promise.all(commands.map((command,i)=>save(command,i%2?otherView:view)));const attendance=await legacy;if(!attendance.ok)throw Error("Legacy rejected");
  expect([...responses.map(r=>result(r).result),attendance.data.results[0].result].sort()).toEqual(["CREATED","UNCHANGED","UNCHANGED","UNCHANGED"]);expect(await rows(people[2])).toHaveLength(1);
 });
 it("keeps explicit conflict and base-version correction semantics under the gate",async()=>{
  const before=await pristine(people[1]);const conflict=result(await save(await protectedBody("different",people[1],{states:{[f.status]:f.b}})));expect(conflict.result).toBe("CONFLICT");
  const corrected=result(await save(await protectedBody("correct",people[1],{states:{[f.status]:f.b},overwrite:true,expectedUpdatedAt:before.record.updatedAt.toISOString()})));expect(corrected).toMatchObject({result:"UPDATED",recordId:before.record.id});
  expect(result(await save(await protectedBody("stale",people[1],{states:{[f.status]:f.a},overwrite:true,expectedUpdatedAt:before.record.updatedAt.toISOString()})))).toMatchObject({result:"CONFLICT",conflictReason:"EXPECTED_UPDATED_AT_MISMATCH"});
  const [record]=await rows(people[1]);expect(record.outgoingRelations).toContainEqual(expect.objectContaining({sourceFieldId:f.relation,targetRecordId:f.lot1}));
 });
 it("rejects generic editor create/update without mutating values, relations or audit",async()=>{
  const before=await pristine(people[1]);
  for(const actor of [f.user,f.denied]) await expect(createEntityRecord(f.contract,f.target,actor,recordForm(people[3]))).rejects.toMatchObject({code:"WORKFLOW_WRITER_REQUIRED"});
  await expect(updateEntityRecord(f.contract,f.target,before.record.id,f.user,recordForm(people[1]))).rejects.toMatchObject({code:"WORKFLOW_WRITER_REQUIRED"});
  expect(await rows(people[3])).toHaveLength(0);expect(await pristine(people[1])).toEqual(before);
 });
 it("rejects generic API even if the body forges a compatible workflow capability",async()=>{
  const entity=await getApiEntityDefinition(f.contract,f.target);if(!entity)throw Error("No entity");const before=await pristine(people[1]);
  const response=await createApiEntityRecord({appId:f.app,contractId:f.contract,userId:f.user,entity,body:{clientRequestId:id("generic_create"),writeCommand:await cap(),values:{subject:people[3],date:day,state:"a",choice:"one",relation:f.lot1}}});
  expect(response.ok).toBe(false);if(!response.ok)expect((await response.response.json()).error.code).toBe("WORKFLOW_WRITER_REQUIRED");
  const patch=await patchApiEntityRecord({appId:f.app,contractId:f.contract,userId:f.user,entity,recordId:before.record.id,body:{clientRequestId:id("generic_patch"),expectedUpdatedAt:before.record.updatedAt.toISOString(),values:{state:"b"}}});
  const deniedResponse=patch.ok ? patch.directResponse : patch.response;if(!deniedResponse)throw Error("Expected rejection response");expect(deniedResponse.status).toBe(400);expect((await deniedResponse.json()).error.code).toBe("WORKFLOW_WRITER_REQUIRED");expect(await pristine(people[1])).toEqual(before);
 });
 it("rejects import before parsing and keeps the existing reports",async()=>{
  const before=await pristine(people[1]);await expect(importEntityRecords({contractId:f.contract,entityTypeId:f.target,userId:f.user,file:new File(["synthetic"],"fixture.xlsx")})).rejects.toMatchObject({code:"WORKFLOW_WRITER_REQUIRED"});expect(await pristine(people[1])).toEqual(before);
 });
 it("blocks direct deletion and catalog deletion that would remove a protected relation",async()=>{
  const before=await pristine(people[1]);
  await expect(deleteEntityRecordsPermanently(f.contract,f.target,[before.record.id],f.user,deleteRecordsConfirmationText(1))).rejects.toMatchObject({code:"WORKFLOW_WRITER_REQUIRED"});
  await expect(deleteEntityRecordsPermanently(f.contract,f.catalog,[f.lot1],f.user,deleteRecordsConfirmationText(1))).rejects.toMatchObject({code:"WORKFLOW_WRITER_REQUIRED"});
  expect(await pristine(people[1])).toEqual(before);expect(await prisma.entityRecord.count({where:{id:f.lot1}})).toBe(1);
 });
 it("rejects unlisted AppViews, forged fingerprints and denied assignments",async()=>{
  expect(result(await save(await protectedBody("bad_fingerprint",people[3],{writeCommand:{version:1,configurationFingerprint:"0".repeat(64),capabilities:["relation-context-v1"]}})))).toMatchObject({result:"ERROR",code:"WORKFLOW_COMMAND_INCOMPATIBLE"});
  expect((await save(await protectedBody("assignment_denied",people[3]),view,f.denied)).ok).toBe(false);
  const formData=form();formData.set("name",id("unlisted"));formData.set("slug",id("unlisted").replaceAll("_","-"));formData.delete("workflowWritePolicy");
  const unlisted=await createAppView(f.contract,f.user,getAppViewInput(formData));if(!unlisted)throw Error("No unlisted view");await prisma.userAppViewAccess.create({data:{userId:f.user,appViewId:unlisted.id,contractId:f.contract}});
  const unlistedCommand=body("unlisted",people[3],{writeCommand:await cap(unlisted.id)});expect(result(await save(unlistedCommand,unlisted.id))).toMatchObject({result:"ERROR",code:"WORKFLOW_NOT_AUTHORIZED"});expect(await rows(people[3])).toHaveLength(0);
 });
 it("requires admin for policy edits and retains the fence while the owner is inactive",async()=>{
  expect(await updateAppView(f.contract,view,f.denied,getAppViewInput(form(policy(false))))).toBeNull();
  await setAppViewActive(f.contract,view,f.user,false);await expect(createEntityRecord(f.contract,f.target,f.user,recordForm(people[4]))).rejects.toMatchObject({code:"WORKFLOW_WRITER_REQUIRED"});await setAppViewActive(f.contract,view,f.user,true);
 });
 it("rejects native generic route handlers and an alternate append workflow without business mutation",async()=>{
  const before=await pristine(people[1]);
  for(const role of ["admin","member"]){
   const request=new Request("https://synthetic.invalid/api/v1/records",{method:"POST",headers:{"content-type":"application/json","x-synthetic-role":role},body:JSON.stringify({clientRequestId:id("endpoint_"+role),values:{subject:people[5],date:day,state:"a",choice:"one",relation:f.lot1}})});
   const response=await genericPOST(request,{params:Promise.resolve({contractId:f.contract,entityTypeId:f.target})});expect(response.status).toBe(400);expect((await response.json()).error.code).toBe("WORKFLOW_WRITER_REQUIRED");
  }
  const response=await genericPATCH(new Request("https://synthetic.invalid/api/v1/records/record",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({clientRequestId:id("endpoint_patch"),expectedUpdatedAt:before.record.updatedAt.toISOString(),values:{state:"b"}})}),{params:Promise.resolve({contractId:f.contract,entityTypeId:f.target,recordId:before.record.id})});expect(response.status).toBe(400);expect((await response.json()).error.code).toBe("WORKFLOW_WRITER_REQUIRED");
  const rogue=await prisma.appView.create({data:{contractId:f.contract,name:id("append"),slug:id("append"),type:"WORKFLOW",config:{workflowKey:"state-update",sourceEntityTypeId:f.source,targetEntityTypeId:f.target,subjectFieldId:f.subject,dateFieldId:f.date,stateFields:[{fieldId:f.status,required:true}],extraFieldIds:[f.choice,f.relation,f.observation],historyMode:"append",uniqueness:{mode:"none"}}}});
  await prisma.userAppViewAccess.create({data:{appViewId:rogue.id,contractId:f.contract,userId:f.user}});
  const denied=await statePOST(new Request("https://synthetic.invalid/api/v1/workflow/state-update",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(await protectedBody("append_bypass",people[5],{},rogue.id))}),{params:Promise.resolve({contractId:f.contract,appViewId:rogue.id})});expect(denied.status).toBe(200);expect((await denied.json()).data.result).toMatchObject({result:"ERROR",code:"WORKFLOW_NOT_AUTHORIZED"});
  expect(await rows(people[5])).toHaveLength(0);expect(await pristine(people[1])).toEqual(before);
 });
 it("replays a completed generic API command without a new effect after activation",async()=>{
  const entity=await getApiEntityDefinition(f.contract,f.target);if(!entity)throw Error("No entity");
  const before=await pristine(people[20]);const replay=await createApiEntityRecord({appId:f.app,contractId:f.contract,userId:f.user,entity,body:legacyGenericRequest});expect(replay).toMatchObject({ok:true,replay:true,recordId:legacyGenericRecordId});expect(await pristine(people[20])).toEqual(before);
 });
 it("rolls back a protected transaction and preserves capability replay on a fresh retry",async()=>{
  const prepared=await getStateUpdateContextForConfig({appView:{id:view,name:"Synthetic",slug:"synthetic"},config:attendanceStateUpdateConfig(config()),contractId:f.contract});if(!prepared.ok)throw Error("No context");const audits=await prisma.auditEvent.count({where:{contractId:f.contract}});
  await expect(prisma.$transaction(async transaction=>{await saveStateUpdateEntry({appId:f.app,context:{...prepared.context,transaction},contractId:f.contract,idempotencyKey:null,input:{writeCommand:await cap(),subjectRecordId:people[6],date:new Date(day+"T00:00:00Z"),dateValue:day,states:{[f.status]:f.a},extraValues:{[f.choice]:"one",[f.relation]:f.lot1},overwrite:false},userId:f.user});throw Error("SYNTHETIC_ROLLBACK");})).rejects.toThrow("SYNTHETIC_ROLLBACK");
  expect(await rows(people[6])).toHaveLength(0);expect(await prisma.auditEvent.count({where:{contractId:f.contract}})).toBe(audits);
  expect(result(await save(await protectedBody("after_rollback",people[6]))).result).toBe("CREATED");
 });
 it("keeps an unrelated unprotected deletion available in the same contract",async()=>{
  expect(await deleteEntityRecordsPermanently(f.contract,f.catalog,[f.lot2],f.user,deleteRecordsConfirmationText(1))).toEqual({count:1});expect(await prisma.entityRecord.count({where:{id:f.lot2}})).toBe(0);expect(await rows(people[1])).toHaveLength(1);
 });
 it("blocks contract purge without removing protected audit or records",async()=>{
  const before=await pristine(people[1]);await prisma.contract.update({where:{id:f.contract},data:{status:"ARCHIVED"}});
  try {await expect(deleteContractForAdmin(f.user,f.contract,deleteContractConfirmationText(f.contract))).rejects.toMatchObject({code:"WORKFLOW_WRITER_REQUIRED"});}finally{await prisma.contract.update({where:{id:f.contract},data:{status:"ACTIVE"}});}
  expect(await pristine(people[1])).toEqual(before);
 });
 it("rejects displayName recalculation as a metadata-based alternate record writer",async()=>{
  const before=await pristine(people[1]),fieldBefore=await prisma.entityField.findUnique({where:{id:f.subject}});
  const fields=new FormData();for(const[key,value]of Object.entries({name:"subject",key:"subject",type:"RELATION",required:"on",isActive:"on",targetEntityTypeId:f.source,relationKind:"ONE",displayPrimary:"on"}))fields.set(key,value);
  await expect(updateEntityField(f.contract,f.target,f.subject,f.user,getEntityFieldInput(fields))).rejects.toMatchObject({code:"WORKFLOW_WRITER_REQUIRED"});expect(await prisma.entityField.findUnique({where:{id:f.subject}})).toEqual(fieldBefore);expect(await pristine(people[1])).toEqual(before);
 });
 it("keeps a metadata-only primary-field edit available when no record displayName changes",async()=>{
  const before=await pristine(people[1]),fingerprint=(await cap()).configurationFingerprint;
  const fields=new FormData();for(const[key,value]of Object.entries({name:"relation",key:"relation",description:"Synthetic metadata",type:"RELATION",required:"on",isActive:"on",targetEntityTypeId:f.catalog,relationKind:"ONE",displayPrimary:"on"}))fields.set(key,value);
  const updated=await updateEntityField(f.contract,f.target,f.relation,f.user,getEntityFieldInput(fields));expect(updated?.description).toBe("Synthetic metadata");expect(await pristine(people[1])).toEqual(before);expect((await cap()).configurationFingerprint).toBe(fingerprint);
 });
 it("preserves the live policy when an older editor form omits its key",async()=>{
  const legacyForm=form();legacyForm.delete("workflowWritePolicy");const before=await prisma.appView.findUnique({where:{id:view}});
  await updateAppView(f.contract,view,f.user,getAppViewInput(legacyForm));const after=await prisma.appView.findUnique({where:{id:view}});expect((after!.config as Record<string,unknown>).workflowWritePolicy).toEqual((before!.config as Record<string,unknown>).workflowWritePolicy);
  await expect(createEntityRecord(f.contract,f.target,f.user,recordForm(people[7]))).rejects.toMatchObject({code:"WORKFLOW_WRITER_REQUIRED"});
 });
 it("requires an explicit paused disarm and leaves unprotected writes unchanged afterwards",async()=>{
  await expect(updateAppView(f.contract,view,f.user,getAppViewInput(form(undefined,true)))).rejects.toMatchObject({code:"WORKFLOW_POLICY_DISARM_REQUIRED"});
  await configure(false);await expect(updateAppView(f.contract,view,f.user,getAppViewInput(form()))).rejects.toMatchObject({code:"WORKFLOW_POLICY_DISARM_REQUIRED"});
  await updateAppView(f.contract,view,f.user,getAppViewInput(form(undefined,true)));
  expect((await workflowWriteMetadata(f.target,view)).workflowWriteContract).toBeNull();expect(await createEntityRecord(f.contract,f.target,f.user,recordForm(people[4]))).not.toBeNull();
 });
});
