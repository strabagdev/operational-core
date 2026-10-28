import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {AppViewForm} from "../app/app/contracts/[contractId]/settings/views/app-view-form";
import {FieldEditorControls} from "../app/app/contracts/[contractId]/settings/entities/[entityTypeId]/field-editor-form";
import {parseAppViewConfig} from "./app-views";
import {parseFieldConfig} from "./field-validation";
import unicodeData from "./search-comparison-data.json";
import fixtures from "./search-comparison-fixtures.json";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { beforeAll,afterAll,describe,it,expect } from "vitest";
import { prisma } from "./prisma";
import { createAppView,getAppViewInput,getAppViewAdminData,updateAppView } from "./app-views";
import { createEntityFieldWithOptions,getEntityFieldEditorInput,updateEntityFieldWithOptions,getAuthorizedEntityType } from "./entity-config";
import { getApiEntityDefinition } from "./api-entities";
import { serializeApiEntityDefinition } from "./api-entity-serializer";
import { getAttendanceWorkflowDay } from "./attendance-workflow";
import { getStateUpdateWorkflow,saveStateUpdateWorkflow } from "./state-update-workflow";
import { comparisonValueSql,configuredComparisonSql,workflowSearchMetadata,workflowSubjectsSql } from "./workflow-search-comparison";
import { type SearchComparison,searchComparisonMatches } from "./search-comparison";
const enabled=process.env.SEARCH_COMPARISON_PG_INTEGRATION==="1";
const suite=enabled?describe.sequential:describe.skip;
const prefix="comparison_"+randomUUID().replaceAll("-","").slice(0,12),id=(s:string)=>prefix+"_"+s;
const f={org:id("org"),user:id("user"),contract:id("contract"),source:id("source"),target:id("target"),compound:id("compound"),name:id("name"),code:"",person:id("person"),date:id("date"),status:id("status"),option:id("option"),attendance:"",state:"",composite:""};
const policy:SearchComparison={version:1,ignoreCase:true,ignoreCharacters:["-","."],ignoreWhitespace:true,match:"exact"};
let connected=false;
const code=(i:number)=>i%3===0?"00.123-K":i%3===1?"0 0 1 2 3 k":`other-${i}`;
function fieldForm(rule?:SearchComparison|null){const fd=new FormData();for(const [k,v]of Object.entries({name:"Identificador sintético",key:"code",type:"TEXT",required:"true",isActive:"true",searchable:"true",displayPrimary:"true",displayShowInList:"true",displayShowInClient:"true"}))fd.set(k,v);if(rule!==undefined){fd.set("searchComparisonEditorVersion","1");fd.set("searchComparisonEnabled",rule?"true":"false");if(rule){fd.set("searchComparisonIgnoreCase",String(rule.ignoreCase));fd.set("searchComparisonIgnoreWhitespace",String(rule.ignoreWhitespace));fd.set("searchComparisonIgnoreCharacters",JSON.stringify(rule.ignoreCharacters));fd.set("searchComparisonMatch",rule.match);}}return getEntityFieldEditorInput(fd);}
function viewForm(kind:"attendance"|"state-update",compound=false,includeReader=true){const fd=new FormData();for(const [k,v]of Object.entries({name:kind+" synthetic "+compound,slug:kind+"-"+(compound?"compound":"plain")+"-"+prefix.replaceAll("_","-"),type:"WORKFLOW",workflowKey:kind,sourceEntityTypeId:f.source,targetEntityTypeId:compound?f.compound:f.target,personFieldId:f.person,subjectFieldId:compound?id("cp"):f.person,dateFieldId:compound?id("cd"):f.date,statusFieldId:f.status,defaultCheckInOptionId:f.option,historyMode:"update-current",uniquenessMode:compound?"subject-date-fields":"subject-date",active:"true"}))fd.set(k,v);fd.append("stateFieldIds",compound?id("cs"):f.status);if(compound)fd.append("identityFieldIds",id("context"));if(includeReader)fd.set("codeSearchFieldId",f.code);return fd;}
async function stateRead(query:{search:string;searchFieldId?:string;page?:string;pageSize?:string}){const r=await getStateUpdateWorkflow({contractId:f.contract,appViewId:f.state,userId:f.user,date:"2026-10-28",...query});if(!r.ok)throw new Error("Synthetic state read rejected: "+JSON.stringify(await r.response.json()));return r.data;}
suite("comparison workflow real local PostgreSQL",()=>{
 beforeAll(async()=>{
  const u=new URL(process.env.DATABASE_URL??"");if(u.hostname!=="127.0.0.1"||u.port!=="5432"||u.pathname!=="/opco_development"||decodeURIComponent(u.username)!=="opco_dev")throw Error("LOCAL_DATABASE_REQUIRED");
  const [dest]=await prisma.$queryRaw<Array<{database:string;role:string;address:string}>>`SELECT current_database() AS database,current_user AS role,inet_server_addr()::text AS address`;expect(dest).toEqual({database:"opco_development",role:"opco_dev",address:"127.0.0.1/32"});connected=true;
  await prisma.organization.create({data:{id:f.org,name:"Comparación sintética",slug:f.org}});await prisma.user.create({data:{id:f.user,email:id("user")+"@example.invalid",passwordHash:"synthetic-no-login"}});await prisma.membership.create({data:{organizationId:f.org,userId:f.user,role:"ADMIN"}});await prisma.contract.create({data:{id:f.contract,organizationId:f.org,code:f.contract,name:"Contrato sintético de búsqueda",slug:f.contract}});
  await prisma.entityType.createMany({data:[{id:f.source,contractId:f.contract,name:"Sujetos sintéticos",slug:f.source},{id:f.target,contractId:f.contract,name:"Eventos sintéticos",slug:f.target,nature:"TRANSACTION"},{id:f.compound,contractId:f.contract,name:"Contextos sintéticos",slug:f.compound,nature:"TRANSACTION"}]});
  await prisma.externalApp.create({data:{id:id("external"),organizationId:f.org,clientId:id("client"),name:"App sintética",slug:id("external")}});
  const input=fieldForm();f.code=(await createEntityFieldWithOptions(f.contract,f.source,f.user,input.field,input.options))!.id;
  await prisma.entityField.create({data:{id:f.name,entityTypeId:f.source,name:"Nombre",key:"name",type:"TEXT",searchable:true}});
  for(const [field,key,type,config]of [[f.person,"subject","RELATION",{targetEntityTypeId:f.source,relationKind:"ONE"}],[f.date,"date","DATE",{}],[f.status,"status","SELECT",{}]] as const)await prisma.entityField.create({data:{id:field,entityTypeId:f.target,name:key,key,type,config}});
  await prisma.fieldOption.create({data:{id:f.option,entityFieldId:f.status,label:"Estado sintético",value:"ok"}});
  f.attendance=(await createAppView(f.contract,f.user,getAppViewInput(viewForm("attendance"))))!.id;f.state=(await createAppView(f.contract,f.user,getAppViewInput(viewForm("state-update"))))!.id;
  for(const viewId of [f.attendance,f.state])await prisma.userAppViewAccess.create({data:{contractId:f.contract,userId:f.user,appViewId:viewId}});
  const indices=Array.from({length:240},(_,i)=>i);await prisma.entityRecord.createMany({data:indices.flatMap(i=>[{id:id("subject"+String(i).padStart(4,"0")),entityTypeId:f.source,displayName:"sentinel-"+String(i).padStart(4,"0")},{id:id("event"+String(i).padStart(4,"0")),entityTypeId:f.target,displayName:"Evento sintético"}])});
  await prisma.entityValue.createMany({data:indices.flatMap(i=>[{entityRecordId:id("subject"+String(i).padStart(4,"0")),entityFieldId:f.code,textValue:code(i)},{entityRecordId:id("subject"+String(i).padStart(4,"0")),entityFieldId:f.name,textValue:i===2?"00123K":"Nombre sintético "+i},{entityRecordId:id("event"+String(i).padStart(4,"0")),entityFieldId:f.date,dateValue:new Date("2026-10-28T00:00:00.000Z")},{entityRecordId:id("event"+String(i).padStart(4,"0")),entityFieldId:f.status,textValue:"ok"}])});
  await prisma.entityRelation.createMany({data:indices.map(i=>({sourceRecordId:id("event"+String(i).padStart(4,"0")),sourceFieldId:f.person,targetRecordId:id("subject"+String(i).padStart(4,"0"))}))});
 });
 afterAll(async()=>{try{if(connected){await prisma.stateUpdateIdentitySlot.deleteMany({where:{definition:{targetEntityTypeId:f.compound}}});await prisma.stateUpdateIdentityDefinition.deleteMany({where:{targetEntityTypeId:f.compound}});await prisma.apiIdempotencyKey.deleteMany({where:{contractId:f.contract}});await prisma.auditEvent.deleteMany({where:{contractId:f.contract}});await prisma.entityRelation.deleteMany({where:{sourceRecord:{entityType:{contractId:f.contract}}}});await prisma.organization.deleteMany({where:{id:f.org}});await prisma.user.deleteMany({where:{id:f.user}});expect(await prisma.organization.count({where:{id:f.org}})).toBe(0);}}finally{await prisma.$disconnect();}});
 it("editor roundtrip stores only policy, keeps original rows/display/version and preserves reader on omitted key",async()=>{
  const before=await prisma.entityRecord.findMany({where:{entityTypeId:f.source},select:{id:true,displayName:true,updatedAt:true,values:true},orderBy:{id:"asc"}});
  const input=fieldForm(policy);await updateEntityFieldWithOptions(f.contract,f.source,f.code,f.user,input.field,input.options);
  expect(await prisma.entityRecord.findMany({where:{entityTypeId:f.source},select:{id:true,displayName:true,updatedAt:true,values:true},orderBy:{id:"asc"}})).toEqual(before);
  const editor=await getAuthorizedEntityType(f.contract,f.source,f.user);expect(editor!.entityType.fields.find(v=>v.id===f.code)!.config).toMatchObject({searchComparison:policy});
  const api=serializeApiEntityDefinition((await getApiEntityDefinition(f.contract,f.source))!);expect(api.fields.find(v=>v.id===f.code)!.config.searchComparison).toEqual(policy);
  const admin=await getAppViewAdminData(f.contract,f.user);expect(admin!.entityTypes.find(e=>e.id===f.source)!.fields.find(v=>v.id===f.code)!.searchable).toBe(true);
  const storedView=await prisma.appView.findUniqueOrThrow({where:{id:f.attendance}});
  const appHtml=renderToStaticMarkup(createElement(AppViewForm,{action:async()=>({success:true}),submitLabel:"Guardar experiencia",entityTypes:admin!.entityTypes,initialValues:{...storedView,config:parseAppViewConfig(storedView)}}));
  const select=appHtml.match(/<select[^>]*name="codeSearchFieldId"[^>]*>[\s\S]*?<\/select>/)![0];
  const selected=select.match(/<option[^>]*value="([^"]+)"[^>]*selected=""[^>]*>/)![0];expect(selected).not.toContain("disabled");expect(selected).toContain(f.code);
  const visibleField=editor!.entityType.fields.find(v=>v.id===f.code)!;
  const fieldHtml=renderToStaticMarkup(createElement(FieldEditorControls,{defaultValues:{...visibleField,...parseFieldConfig(visibleField.config)},entityName:"Sujetos",entityTypes:[],fieldCount:2,fieldErrors:{},hasPrimary:true,mode:"edit",setFirstErrorRef:()=>{}}));
  expect(fieldHtml).toContain('name="searchComparisonEditorVersion"');
  const characters=fieldHtml.match(/<input[^>]*name="searchComparisonIgnoreCharacters"[^>]*>/)![0].match(/value="([^"]*)"/)![1].replaceAll("&quot;",'"').replaceAll("&amp;","&");
  const renderedRule=fieldForm(policy);const formForRoundtrip=new FormData();for(const [k,v]of Object.entries({name:"Identificador sintético",key:"code",type:"TEXT",required:"true",isActive:"true",searchable:"true",displayPrimary:"true",displayShowInList:"true",displayShowInClient:"true",searchComparisonEditorVersion:"1",searchComparisonEnabled:"true",searchComparisonIgnoreCase:"true",searchComparisonIgnoreWhitespace:"true",searchComparisonIgnoreCharacters:characters,searchComparisonMatch:"exact"}))formForRoundtrip.set(k,v);
  expect(getEntityFieldEditorInput(await new Request("https://synthetic.invalid",{method:"POST",body:formForRoundtrip}).formData()).field.searchComparison).toEqual(renderedRule.field.searchComparison);
  const fd=viewForm("attendance",false,false);await updateAppView(f.contract,f.attendance,f.user,getAppViewInput(fd));expect((await prisma.appView.findUniqueOrThrow({where:{id:f.attendance}})).config).toMatchObject({codeSearch:{fieldId:f.code}});
  fd.set("codeSearchFieldId","");await updateAppView(f.contract,f.attendance,f.user,getAppViewInput(fd));expect((await prisma.appView.findUniqueOrThrow({where:{id:f.attendance}})).config).not.toHaveProperty("codeSearch");
  await updateAppView(f.contract,f.attendance,f.user,getAppViewInput(viewForm("attendance")));
  const reopen=fieldForm(policy);await updateEntityFieldWithOptions(f.contract,f.source,f.code,f.user,reopen.field,reopen.options);expect((await prisma.entityField.findUniqueOrThrow({where:{id:f.code}})).config).toMatchObject({searchComparison:policy});
 });
 it("filters before limits/count/page, combines global fields and keeps equivalent IDs independent",async()=>{
  const query={search:"00123k",searchFieldId:f.code,page:"1",pageSize:"10"};const first=await stateRead(query),second=await stateRead({...query,page:"2"});
  expect(first.subjects).toHaveLength(20);expect(first.latest.pagination.total).toBe(160);expect(first.latest.items).toHaveLength(10);expect(second.latest.pagination.total).toBe(160);expect(second.latest.items).toHaveLength(10);expect(new Set([...first.latest.items,...second.latest.items].map(v=>v.recordId)).size).toBe(20);
  const global=await stateRead({search:"00123k",pageSize:"100"});expect(global.latest.pagination.total).toBe(161);expect(global.searchComparison.applied.mode).toBe("global");
  const attendance=await getAttendanceWorkflowDay({appViewId:f.attendance,contractId:f.contract,userId:f.user,date:"2026-10-28",search:"00123k",searchFieldId:f.code});expect(attendance.ok).toBe(true);if(!attendance.ok)throw Error("Attendance rejected");expect(attendance.data.items.map(v=>v.person.id)).toEqual(first.subjects.map(v=>v.subject.id));expect(attendance.data.summary.totalRegistered).toBe(240);
  expect((await stateRead({search:"---"})).latest.pagination.total).toBe(0);const empty=await getStateUpdateWorkflow({appViewId:f.state,contractId:f.contract,userId:f.user,search:"---",searchFieldId:f.code});expect(empty.ok).toBe(false);if(!empty.ok)expect((await empty.response.json()).error.code).toBe("EMPTY_NORMALIZED_SEARCH");
  const invalid=await getStateUpdateWorkflow({appViewId:f.state,contractId:f.contract,userId:f.user,search:"00123k",searchFieldId:"foreign"});expect(invalid.ok).toBe(false);
 });
 it("uses the same predicate and count for a composite context",async()=>{
  for(const [field,key,type,config]of [[id("cp"),"subject","RELATION",{targetEntityTypeId:f.source,relationKind:"ONE"}],[id("cd"),"date","DATE",{}],[id("cs"),"status","SELECT",{}],[id("context"),"context","SELECT",{}]] as const)await prisma.entityField.create({data:{id:field,entityTypeId:f.compound,name:key,key,type,config}});
  await prisma.fieldOption.createMany({data:[{id:id("co"),entityFieldId:id("context"),label:"Contexto A",value:"a"},{id:id("so"),entityFieldId:id("cs"),label:"Estado",value:"ok"}]});f.composite=(await createAppView(f.contract,f.user,getAppViewInput(viewForm("state-update",true))))!.id;
  await prisma.userAppViewAccess.create({data:{contractId:f.contract,userId:f.user,appViewId:f.composite}});
  const definition=await prisma.stateUpdateIdentityDefinition.findUniqueOrThrow({where:{targetEntityTypeId:f.compound}}),identity={version:1 as const,definitionId:definition.id,values:{[id("context")]:id("co")}};
  for(const i of [0,1,3]){const saved=await saveStateUpdateWorkflow({appId:id("external"),appViewId:f.composite,contractId:f.contract,userId:f.user,body:{clientRequestId:id("request"+i),subjectRecordId:id("subject"+String(i).padStart(4,"0")),date:"2026-10-28",identity,states:{[id("cs")]:id("so")}}});if(!saved.ok)throw Error("Synthetic composite save rejected: "+JSON.stringify(await saved.response.json()));}
  const get=async(page:string)=>{const r=await getStateUpdateWorkflow({appViewId:f.composite,contractId:f.contract,userId:f.user,date:"2026-10-28",identity,search:"00123k",searchFieldId:f.code,page,pageSize:"2"});if(!r.ok)throw Error("Composite read failed");return r.data;};const a=await get("1"),b=await get("2");expect(a.latest.pagination.total).toBe(3);expect(a.latest.items).toHaveLength(2);expect(b.latest.items).toHaveLength(1);expect(new Set([...a.latest.items,...b.latest.items].map(x=>x.recordId)).size).toBe(3);
 });
 it("proves every simple Unicode 17 mapping in SQL against the same immutable Client table",async()=>{
  const sources=Array.from(unicodeData.foldSource),targets=Array.from(unicodeData.foldTarget);expect(sources).toHaveLength(1512);
  const rows=await prisma.$queryRaw<Array<{mismatches:bigint;checked:bigint}>>(Prisma.sql`WITH fixture(input,expected)AS(VALUES ${Prisma.join(sources.map((c,i)=>Prisma.sql`(${c},${targets[i]})`))}) SELECT count(*) FILTER(WHERE (${comparisonValueSql(Prisma.sql`fixture.input`,policy)} COLLATE "C") <> (expected COLLATE "C"))::bigint AS mismatches,count(*)::bigint AS checked FROM fixture`);
  expect(rows).toEqual([{mismatches:BigInt(0),checked:BigInt(1512)}]);
 });
 it("matches Unicode/literal fixtures in real PostgreSQL and records bounded query cost",async()=>{
  const rows=fixtures.rows;
  for(const q of fixtures.queries){const expected=rows.filter(([,v])=>searchComparisonMatches(v,q,policy)).map(([key])=>key).sort();const actual=await prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`WITH fixture(id,value)AS(VALUES ${Prisma.join(rows.map(row=>Prisma.sql`(${row[0]},${row[1]})`))})SELECT id FROM fixture WHERE ${configuredComparisonSql(Prisma.sql`fixture.value`,q,policy)} ORDER BY id`);expect(actual.map(v=>v.id)).toEqual(expected);}
  for(const variant of [
   {...policy,match:"contains" as const},
   {...policy,ignoreCase:false},
   {...policy,ignoreCharacters:["[","]","%","_","\\","\'"]},
  ])for(const q of ["123", "K", "[]%_\\\'", "Ñ áéíóú ü σ Σ ß", "---"]){
   const expected=rows.filter(([,v])=>searchComparisonMatches(v,q,variant)).map(([key])=>key).sort();
   const actual=await prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`WITH fixture(id,value)AS(VALUES ${Prisma.join(rows.map(row=>Prisma.sql`(${row[0]},${row[1]})`))})SELECT id FROM fixture WHERE ${configuredComparisonSql(Prisma.sql`fixture.value`,q,variant)} ORDER BY id`);
   expect(actual.map(v=>v.id)).toEqual(expected);
  }
  const entity=await getApiEntityDefinition(f.contract,f.source);const metadata=workflowSearchMetadata(entity!.fields,f.source,"state-update","00123k",f.code);const samples:number[]=[];
  for(let i=0;i<5;i++){const start=performance.now();const actual=await prisma.$queryRaw<Array<{id:string}>>(workflowSubjectsSql(metadata,"00123k",f.code));expect(actual).toHaveLength(20);samples.push(performance.now()-start);}
  const plan=await prisma.$queryRaw<Array<{"QUERY PLAN":string}>>(Prisma.sql`EXPLAIN (ANALYZE,FORMAT TEXT) ${workflowSubjectsSql(metadata,"00123k",f.code)}`);
  if(process.env.SEARCH_COMPARISON_METRICS_FILE)writeFileSync(process.env.SEARCH_COMPARISON_METRICS_FILE,JSON.stringify({fixtureSubjects:240,fixtureEvents:240,matchingSubjects:160,pageSize:20,samplesMs:samples,explainTiming:plan.map(x=>x["QUERY PLAN"]).filter(t=>/^(Planning|Execution) Time:/.test(t)),scope:"Local synthetic rows, warm repeats, not a production estimate"},null,2)+"\n");
 });
});
