import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "./prisma";
import { createAppView, getAppViewInput } from "./app-views";
import { signApiAccessToken } from "./api-auth";
import { saveStateUpdateWorkflow } from "./state-update-workflow";
import { GET } from "../app/api/v1/contracts/[contractId]/views/[appViewId]/workflow/state-update/route";
vi.mock("@/lib/prisma", async () => { const {PrismaClient}=await import("@prisma/client"); return {prisma:new PrismaClient({log:[{emit:"event",level:"query"}]})}; });
const suite=process.env.CURRENT_BATCH_PG_INTEGRATION==="1"?describe.sequential:describe.skip;
const prefix="batch_"+randomUUID().replaceAll("-","").slice(0,12), id=(s:string)=>prefix+"_"+s;
const f={org:id("org"),user:id("user"),outsider:id("outsider"),contract:id("contract"),source:id("source"),target:id("events"),composite:id("reports"),app:id("app"),subject:id("subject"),date:id("date"),revision:id("revision"),shift:id("shift"),a:id("a"),b:id("b"),view:"",compound:"",definition:"",day:"2026-10-29"};
const subjectIds=Array.from({length:217},(_,n)=>id("s"+String(n).padStart(3,"0")));
let checked=false,server:Server,base="",token="",outsideToken="",queries=0,sqlMs=0,http=0;
const metrics:Record<string,unknown>={};
async function view(compound:boolean) {
 const form=new FormData();for(const[k,v]of Object.entries({type:"WORKFLOW",name:"Synthetic batch",slug:id(compound?"compound":"view").replaceAll("_","-"),active:"on",workflowKey:"state-update",sourceEntityTypeId:f.source,targetEntityTypeId:compound?f.composite:f.target,subjectFieldId:f.subject+(compound?"c":""),dateFieldId:f.date+(compound?"c":""),uniquenessMode:compound?"subject-date-fields":"subject",historyMode:compound?"update-current":"append"}))form.set(k,v);
 form.append("stateFieldIds",f.revision+(compound?"c":""));if(compound)form.append("identityFieldIds",f.shift);
 const v=await createAppView(f.contract,f.user,getAppViewInput(form));if(!v)throw Error("Synthetic view denied");
 await prisma.userAppViewAccess.create({data:{contractId:f.contract,userId:f.user,appViewId:v.id}});return v.id;
}
function url(viewId=f.view,params:Record<string,string>={}) { const u=new URL(`${base}/api/v1/contracts/${f.contract}/views/${viewId}/workflow/state-update`);u.searchParams.set("date",f.day);for(const[k,v]of Object.entries(params))u.searchParams.set(k,v);return u; }
async function read(u:URL,auth=token){http++;const r=await fetch(u,{headers:{authorization:"Bearer "+auth}});const body=await r.json();return {status:r.status,body};}
async function metadata(v=f.view){const r=await read(url(v));expect(r.status).toBe(200);return r.body.data;}
async function batch(ids:string[],cap:{configurationFingerprint:string},v=f.view,extra:Record<string,string>={},auth=token){const u=url(v,{currentBatchVersion:"1",currentBatchFingerprint:cap.configurationFingerprint,...extra});for(const id of ids)u.searchParams.append("subjectRecordIds",id);return read(u,auth);}
function begin(){queries=0;sqlMs=0;http=0;return performance.now();}
function measured(start:number){return {http,postgresQueries:queries,postgresStatementMs:sqlMs,durationMs:Math.round((performance.now()-start)*1000)/1000};}
suite("current batches via real HTTP route/auth and local PostgreSQL",()=>{
 beforeAll(async()=>{
  const u=new URL(process.env.DATABASE_URL??"");if(u.hostname!=="127.0.0.1"||u.port!=="5432"||u.pathname!=="/opco_development"||decodeURIComponent(u.username)!=="opco_dev")throw Error("LOCAL_DATABASE_REQUIRED");
  const [dest]=await prisma.$queryRaw<Array<{database:string;role:string;address:string}>>`SELECT current_database()AS database,current_user AS role,inet_server_addr()::text AS address`;
  expect(dest).toEqual({database:"opco_development",role:"opco_dev",address:"127.0.0.1/32"});checked=true;
  (prisma as unknown as {$on(event:"query",callback:(e:{duration:number})=>void):void}).$on("query",e=>{queries++;sqlMs+=e.duration;});
  await prisma.organization.create({data:{id:f.org,name:"Synthetic batches",slug:f.org}});
  for(const user of [f.user,f.outsider]) {await prisma.user.create({data:{id:user,email:user+"@example.invalid",passwordHash:"synthetic-no-login"}});await prisma.membership.create({data:{organizationId:f.org,userId:user,role:user===f.user?"ADMIN":"MEMBER"}});}
  await prisma.contract.create({data:{id:f.contract,organizationId:f.org,code:f.contract,name:"Synthetic contract",slug:f.contract}});
  const app=await prisma.externalApp.create({data:{id:f.app,organizationId:f.org,clientId:id("client"),name:"Synthetic reader",slug:id("app")}});
  await prisma.entityType.createMany({data:[f.source,f.target,f.composite].map(entity=>({id:entity,contractId:f.contract,name:"Synthetic "+entity,slug:entity,nature:entity===f.source?"MASTER":"TRANSACTION"}))});
  for(const target of [f.target,f.composite]) {const c=target===f.composite?"c":"";for(const[field,key,type,config]of [[f.subject+c,"subject","RELATION",{targetEntityTypeId:f.source,relationKind:"ONE"}],[f.date+c,"date","DATE",{}],[f.revision+c,"revision","TEXT",{}]]as const)await prisma.entityField.create({data:{id:field,entityTypeId:target,name:key,key,type,config}});}
  await prisma.entityField.create({data:{id:f.shift,entityTypeId:f.composite,name:"Context",key:"context",type:"SELECT"}});
  await prisma.fieldOption.createMany({data:[{id:f.a,entityFieldId:f.shift,label:"A",value:"a"},{id:f.b,entityFieldId:f.shift,label:"B",value:"b"}]});
  f.view=await view(false);f.compound=await view(true);f.definition=(await prisma.stateUpdateIdentityDefinition.findUniqueOrThrow({where:{targetEntityTypeId:f.composite}})).id;
  await prisma.entityRecord.createMany({data:subjectIds.map((key,n)=>({id:key,entityTypeId:f.source,displayName:"Synthetic "+n}))});
  const events=subjectIds.slice(0,215).map((subject,n)=>({id:id("e"+n),subject,date:"2026-10-20"}));
  events.push({id:id("tie-a"),subject:subjectIds[1],date:f.day},{id:id("tie-b"),subject:subjectIds[1],date:f.day});
  await prisma.entityRecord.createMany({data:events.map(e=>({id:e.id,entityTypeId:f.target,displayName:"Synthetic event"}))});
  await prisma.entityValue.createMany({data:events.flatMap(e=>[{entityRecordId:e.id,entityFieldId:f.date,dateValue:new Date(e.date+"T00:00:00Z")},{entityRecordId:e.id,entityFieldId:f.revision,textValue:e.id}])});
  await prisma.entityRelation.createMany({data:events.map(e=>({sourceRecordId:e.id,sourceFieldId:f.subject,targetRecordId:e.subject}))});
  await prisma.entityRecord.create({data:{id:id("undated"),entityTypeId:f.target,displayName:"Synthetic undated",outgoingRelations:{create:{sourceFieldId:f.subject,targetRecordId:subjectIds[216]}}}});
  for(const option of [f.a,f.b]) {const r=await saveStateUpdateWorkflow({appId:f.app,appViewId:f.compound,contractId:f.contract,userId:f.user,body:{subjectRecordId:subjectIds[0],date:f.day,identity:{version:1,definitionId:f.definition,values:{[f.shift]:option}},clientRequestId:id("write"+option),states:{[f.revision+"c"]:option}}});expect(r.ok).toBe(true);}
  token=await signApiAccessToken({app,user:{id:f.user,email:f.user+"@example.invalid",name:null}});outsideToken=await signApiAccessToken({app,user:{id:f.outsider,email:f.outsider+"@example.invalid",name:null}});
  server=createServer(async(req,res)=>{try{const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(","):v);const path=new URL(req.url!,base),parts=path.pathname.split("/");const r=await GET(new Request(path,{headers}),{params:Promise.resolve({contractId:parts[4],appViewId:parts[6]})});res.writeHead(r.status,Object.fromEntries(r.headers.entries()));res.end(await r.text());}catch{res.writeHead(500);res.end(JSON.stringify({ok:false,error:{code:"SYNTHETIC_TRANSPORT_ERROR"}}));}});
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));base="http://127.0.0.1:"+(server.address()as {port:number}).port;
 });
 afterAll(async()=>{if(process.env.CURRENT_BATCH_METRICS)writeFileSync(process.env.CURRENT_BATCH_METRICS,JSON.stringify(metrics,null,2)+"\n");try{if(server)await new Promise<void>((resolve,reject)=>{server.closeAllConnections();server.close(error=>error?reject(error):resolve());});if(checked){await prisma.apiIdempotencyKey.deleteMany({where:{contractId:f.contract}});await prisma.auditEvent.deleteMany({where:{contractId:f.contract}});await prisma.stateUpdateIdentitySlot.deleteMany({where:{definition:{targetEntityTypeId:f.composite}}});await prisma.stateUpdateIdentityDefinition.deleteMany({where:{targetEntityTypeId:f.composite}});await prisma.entityRelation.deleteMany({where:{sourceRecord:{entityType:{contractId:f.contract}}}});await prisma.organization.deleteMany({where:{id:f.org}});await prisma.user.deleteMany({where:{id:{in:[f.user,f.outsider]}}});expect(await prisma.organization.count({where:{id:f.org}})).toBe(0);}if(process.env.CURRENT_BATCH_METRICS)writeFileSync(process.env.CURRENT_BATCH_METRICS,JSON.stringify(metrics,null,2)+"\n");}finally{await prisma.$disconnect();}});
 const individual=new Map<string,unknown>();
 it("measures individual current for the same 217 subjects",async()=>{const start=begin();for(const key of subjectIds){const r=await read(url(f.view,{subjectRecordId:key,pageSize:"1"}));expect(r.status).toBe(200);individual.set(key,r.body.data.subjects[0].current);}metrics.individual=measured(start);expect(individual.get(subjectIds[215])).toBeNull();expect(individual.get(subjectIds[216])).toBeNull();expect((individual.get(subjectIds[1])as {recordId:string}).recordId).toBe(id("tie-a"));});
 it("matches every individual result in three set-based batches without latest/summary",async()=>{const meta=await metadata(),start=begin();let resolved=0;for(let offset=0;offset<subjectIds.length;offset+=100){const r=await batch(subjectIds.slice(offset,offset+100),meta.currentBatchCapabilities);expect(r.status).toBe(200);expect(r.body.data.latest).toBeUndefined();expect(r.body.data.summary).toBeUndefined();for(const item of r.body.data.subjects){expect(item.current).toEqual(individual.get(item.subject.id));resolved++;}}metrics.batch=measured(start);expect(resolved).toBe(217);expect(http).toBe(3);expect(queries).toBeLessThan(150);});
 it("never turns unavailable subjects into null and enforces assignment/context/bounds/configuration",async()=>{const meta=await metadata();const r=await batch([subjectIds[0],id("unknown"),subjectIds[215]],meta.currentBatchCapabilities);expect(r.status).toBe(200);expect(r.body.data.currentBatch.results.map((v:{status:string})=>v.status)).toEqual(["resolved","error","resolved"]);expect(r.body.data.subjects).toHaveLength(2);expect((await batch([subjectIds[0]],meta.currentBatchCapabilities,f.view,{},outsideToken)).status).toBe(403);expect((await batch([subjectIds[0],subjectIds[0]],meta.currentBatchCapabilities)).status).toBe(400);expect((await batch(subjectIds.slice(0,101),meta.currentBatchCapabilities)).status).toBe(400);expect((await batch([subjectIds[0]],meta.currentBatchCapabilities,f.view,{page:"1"})).status).toBe(400);expect((await batch([subjectIds[0]],{configurationFingerprint:"0".repeat(64)})).status).toBe(409);
 const comp=await metadata(f.compound);expect((await batch([subjectIds[0]],comp.currentBatchCapabilities,f.compound)).status).toBe(400);
 const values=[];for(const option of [f.a,f.b]){const identity={version:1,definitionId:f.definition,values:{[f.shift]:option}};const r=await batch([subjectIds[0],subjectIds[215]],comp.currentBatchCapabilities,f.compound,{identity:JSON.stringify(identity)});expect(r.status).toBe(200);expect(r.body.data.subjects[1].current).toBeNull();values.push(r.body.data.subjects[0].current.recordId);}expect(values[0]).not.toBe(values[1]);});
});
