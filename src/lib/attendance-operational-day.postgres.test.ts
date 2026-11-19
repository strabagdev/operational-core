import {randomUUID} from "node:crypto";
import {beforeAll,afterAll,describe,it,expect} from "vitest";
import {writeFileSync} from "node:fs";
import {hash} from "bcrypt";
import {prisma} from "./prisma";
import {createAppView,getAppViewInput,updateAppView} from "./app-views";
import {saveStateUpdateWorkflow} from "./state-update-workflow";
import {getAttendanceWorkflowDay,saveAttendanceWorkflowDay} from "./attendance-workflow";
import {getApiPanel} from "./panels";
import {PANEL_FEATURES} from "./panel-consumer";
import {operationalCalendarKey, type OperationalCalendar} from "./operational-calendar";
const calendar=(f:{a:string;b:string}):OperationalCalendar=>({version:1,timeZone:"America/Santiago",dayStart:"08:00",bands:[{optionId:f.a,start:"08:00",end:"20:00"},{optionId:f.b,start:"20:00",end:"08:00"}]});
const suite=process.env.OPERATIONAL_DAY_PG==="1"?describe.sequential:describe.skip;
const prefix="local_operational_20261119_"+randomUUID().slice(0,8),id=(key:string)=>prefix+"_"+key;
const ids={org:id("org"),user:id("user"),contract:id("contract"),app:id("app"),source:id("source"),code:id("code"),catalog:id("catalog"),person:id("person"),lot:id("lot"),otherLot:id("lot2")};
const day="2026-11-18",instant="2026-11-19T05:00:00.123Z";
type Fixture={target:string;subject:string;date:string;state:string;capture:string;context:string;note:string;a:string;b:string;view:string;policy:string;form:FormData};
const fixtures:Fixture[]=[];let safe=false;
const request=(f:Fixture,key:string,extra:Record<string,unknown>={})=>({clientRequestId:id(f.policy+key),subjectRecordId:ids.person,date:day,states:{[f.state]:f.a},extraValues:{[f.context]:ids.lot},...(f.policy!=="ONE_PER_DAY"?{repetitionPolicy:f.policy,repetitionAcknowledged:true}:{}),captureTime:{version:1,fieldId:f.capture,timeZone:"America/Santiago"},eventOccurredAt:instant,operationalDay:{version:1,calendarKey:operationalCalendarKey(calendar(f)),mode:"AUTO"},...extra});
async function errorText(r:unknown){const x=r as {response?:Response;directResponse?:Response};const response=x.response??x.directResponse;return JSON.stringify(response?await response.clone().json():r);}
const save=(f:Fixture,body:Record<string,unknown>)=>saveStateUpdateWorkflow({appId:ids.app,appViewId:f.view,contractId:ids.contract,userId:ids.user,body});
function result(r:Awaited<ReturnType<typeof save>>){if(!r.ok)throw Error("Rejected local command: "+JSON.stringify(r));return r.data.result;}
suite("Operational calendar with real PostgreSQL, DATE and shared writes",()=>{
 beforeAll(async()=>{const u=new URL(process.env.DATABASE_URL!);if(u.hostname!=="127.0.0.1"||u.username!=="capture_test"||u.pathname!=="/capture_isolated")throw Error("ISOLATED_DATABASE_REQUIRED");const[c]=await prisma.$queryRaw<{db:string;role:string}[]>`SELECT current_database() db,current_user role`;expect(c).toEqual({db:"capture_isolated",role:"capture_test"});safe=true;
 await prisma.organization.create({data:{id:ids.org,name:"Captura sintética aislada",slug:ids.org}});await prisma.user.create({data:{id:ids.user,email:id("user")+"@example.invalid",passwordHash:await hash("Local-capture-only-2026!",4)}});await prisma.membership.create({data:{organizationId:ids.org,userId:ids.user,role:"ADMIN"}});await prisma.contract.create({data:{id:ids.contract,organizationId:ids.org,name:"Captura local",code:ids.contract,slug:ids.contract}});await prisma.externalApp.create({data:{id:ids.app,organizationId:ids.org,name:"Capture local app",clientId:id("client"),slug:ids.app}});
 await prisma.entityType.createMany({data:[{id:ids.source,contractId:ids.contract,name:"Personas sintéticas",slug:ids.source},{id:ids.catalog,contractId:ids.contract,name:"Catálogo sintético",slug:ids.catalog}]});await prisma.entityField.create({data:{id:ids.code,entityTypeId:ids.source,name:"Identificador",key:"code",type:"TEXT",searchable:true,config:{display:{primary:true,showInList:true}}}});await prisma.entityRecord.createMany({data:[{id:ids.person,entityTypeId:ids.source,displayName:"CAP-001"},{id:ids.lot,entityTypeId:ids.catalog,displayName:"Catálogo Alfa"},{id:ids.otherLot,entityTypeId:ids.catalog,displayName:"Catálogo Beta"}]});await prisma.entityValue.create({data:{entityRecordId:ids.person,entityFieldId:ids.code,textValue:"CAP-001"}});
 for(const policy of["ONE_PER_DAY","MULTIPLE_WITH_WARNING","MULTIPLE"]){const k=policy.toLowerCase(),f:Fixture={target:id(k+"_target"),subject:id(k+"_subject"),date:id(k+"_date"),state:id(k+"_state"),capture:id(k+"_capture"),context:id(k+"_context"),note:id(k+"_note"),a:id(k+"_a"),b:id(k+"_b"),view:"",policy,form:new FormData()};await prisma.entityType.create({data:{id:f.target,contractId:ids.contract,name:"Registros "+policy,slug:f.target,nature:"TRANSACTION"}});
 for(const field of[{id:f.subject,key:"subject",type:"RELATION" as const,required:true,config:{relationKind:"ONE",targetEntityTypeId:ids.source}},{id:f.date,key:"date",type:"DATE" as const,required:true,name:"Día operativo"},{id:f.state,key:"state",type:"SELECT" as const,required:true,name:"Estado configurado"},{id:f.capture,key:"capture",type:"DATETIME" as const,required:false,name:"Hora de captura"},{id:f.context,key:"context",type:"RELATION" as const,required:true,config:{relationKind:"ONE",targetEntityTypeId:ids.catalog},name:"Referencia"},{id:f.note,key:"note",type:"TEXT" as const,required:false,name:"Referencia interna"}])await prisma.entityField.create({data:{...field,name:field.name??field.key,entityTypeId:f.target}});
 await prisma.fieldOption.createMany({data:[{id:f.a,entityFieldId:f.state,label:"A",value:"a"},{id:f.b,entityFieldId:f.state,label:"B",value:"b"}]});for(const[k,v]of Object.entries({type:"WORKFLOW",workflowKey:"attendance",name:"Captura "+policy,slug:("captura-"+policy).toLowerCase().replaceAll("_","-"),active:"on",sourceEntityTypeId:ids.source,targetEntityTypeId:f.target,personFieldId:f.subject,dateFieldId:f.date,statusFieldId:f.state,defaultCheckInOptionId:f.a,codeSearchFieldId:ids.code,repetitionPolicy:policy,captureTimeFieldId:f.capture,captureTimeZone:"America/Santiago"}))f.form.set(k,v);f.form.set("operationalCalendar",JSON.stringify(calendar(f)));f.form.append("contextFieldIds",f.context);const v=await createAppView(ids.contract,ids.user,getAppViewInput(f.form));if(!v)throw Error("View unavailable");f.view=v.id;await prisma.userAppViewAccess.create({data:{userId:ids.user,contractId:ids.contract,appViewId:v.id}});fixtures.push(f);}
 if(process.env.OPERATIONAL_FIXTURE_FILE)writeFileSync(process.env.OPERATIONAL_FIXTURE_FILE,JSON.stringify({ids,email:id("user")+"@example.invalid",clientId:id("client"),fixtures:fixtures.map(f=>Object.fromEntries(Object.entries(f).filter(([key])=>key!=="form")))}));
 });
 afterAll(async()=>{if(safe&&process.env.OPERATIONAL_KEEP_FIXTURE!=="1"){await prisma.organization.delete({where:{id:ids.org}}).catch(()=>undefined);await prisma.user.delete({where:{id:ids.user}}).catch(()=>undefined);}await prisma.$disconnect();});

 it.each([0,1,2])("stores AUTO DATE and original capture for policy %i",async n=>{
 const f=fixtures[n],r=result(await save(f,request(f,"initial")));expect(r.result).toBe("CREATED");if(r.result!=="CREATED")throw Error();
 expect(r.captureTime?.value).toBe(instant);const value=await prisma.entityValue.findFirstOrThrow({where:{entityRecordId:r.recordId,entityFieldId:f.date}});expect(value.dateValue?.toISOString()).toBe(day+"T00:00:00.000Z");
 const read=await getAttendanceWorkflowDay({appViewId:f.view,contractId:ids.contract,userId:ids.user,date:day,operationalDayVersion:"1"});expect(read.ok).toBe(true);if(read.ok)expect(read.data).toMatchObject({operationalDayContract:{version:1,calendarKey:operationalCalendarKey(calendar(f))}});
 });
 it("denies old reads and writers without changing any record or silently reverting to calendar DATE",async()=>{
 const f=fixtures[0],before=await prisma.entityRecord.count({where:{entityTypeId:f.target}});
 const read=await getAttendanceWorkflowDay({appViewId:f.view,contractId:ids.contract,userId:ids.user,date:day});expect(read.ok).toBe(false);if(!read.ok)expect(read.response.status).toBe(426);
 const old=request(f,"old")as Record<string,unknown>;delete old.operationalDay;expect(await errorText(await save(f,old))).toContain("OPERATIONAL_DAY_REVIEW_REQUIRED");
 const legacy=await saveAttendanceWorkflowDay({appId:ids.app,appViewId:f.view,contractId:ids.contract,userId:ids.user,body:{date:day,clientRequestId:id("old-batch"),entries:[{personRecordId:ids.person,statusOptionId:f.a,contextValues:{[f.context]:ids.lot}}]}});expect(JSON.stringify(legacy)).toContain("OPERATIONAL_DAY_REVIEW_REQUIRED");
 expect(await prisma.entityRecord.count({where:{entityTypeId:f.target}})).toBe(before);
 });
 it("keeps person + assigned DATE atomic, UNCHANGED, explicit conflict and idempotency",async()=>{
 const f=fixtures[0],cmd=request(f,"ack-lost");const a=result(await save(f,cmd));expect(a.result).toBe("UNCHANGED");expect(result(await save(f,cmd))).toEqual(a);
 const repeated=await Promise.all(Array.from({length:5},(_,i)=>save(f,request(f,"parallel"+i))));expect(repeated.every(r=>result(r).result==="UNCHANGED")).toBe(true);
 expect(result(await save(f,request(f,"other-state",{states:{[f.state]:f.b}}))).result).toBe("CONFLICT");expect(await prisma.entityRecord.count({where:{entityTypeId:f.target}})).toBe(1);
 });
 it("rejects an AUTO date inconsistent with its ORIGINAL instant, never uses server now",async()=>{
 const f=fixtures[2];expect(await errorText(await save(f,request(f,"wrong-day",{date:"2026-11-19"})))).toContain("OPERATIONAL_DAY_MISMATCH");
 const r=result(await save(f,request(f,"next-server-day")));expect(r.result).toBe("CREATED");
 });
 it("keeps manual retrospective DATE, then edits by ID/version without changing capture",async()=>{
 const f=fixtures[2],meta={version:1,calendarKey:operationalCalendarKey(calendar(f)),mode:"MANUAL"};
 const created=result(await save(f,request(f,"manual",{date:"2026-10-01",operationalDay:meta})));if(created.result!=="CREATED")throw Error();
 const edited=result(await save(f,request(f,"edit",{date:"2026-10-01",targetRecordId:created.recordId,expectedUpdatedAt:created.updatedAt,overwrite:true,states:{[f.state]:f.b},extraValues:{[f.context]:ids.otherLot},eventOccurredAt:undefined,operationalDay:{...meta,mode:"PRESERVE"}})));
 expect(edited).toMatchObject({result:"UPDATED",recordId:created.recordId,captureTime:{value:instant}});
 const d=await prisma.entityValue.findFirstOrThrow({where:{entityRecordId:created.recordId,entityFieldId:f.date}});expect(d.dateValue?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
 });
 it("preserves calendars from old editors and rejects overlapping/inactive bindings",async()=>{
 const f=fixtures[0],old=new FormData();for(const[k,v]of f.form)if(k!=="operationalCalendar")old.append(k,v);
 await updateAppView(ids.contract,f.view,ids.user,getAppViewInput(old));expect((await prisma.appView.findUniqueOrThrow({where:{id:f.view}})).config).toMatchObject({operationalCalendar:calendar(f)});
 for(const bands of [[{optionId:f.a,start:"08:00",end:"20:00"},{optionId:f.b,start:"19:00",end:"08:00"}],[{optionId:"foreign-option",start:"08:00",end:"20:00"}]]){
 const bad=new FormData();for(const[k,v]of f.form)bad.append(k,v);bad.set("operationalCalendar",JSON.stringify({...calendar(f),bands}));await expect(async()=>updateAppView(ids.contract,f.view,ids.user,getAppViewInput(bad))).rejects.toThrow();
 }
 });
 it("PANEL links the same DATE, negotiates old clients, and leaves unbound history independent",async()=>{
 const f=fixtures[2],config={schemaVersion:1,layout:{columns:12,rowHeight:8},filters:[{id:"day",label:"Día operativo",valueType:"DATE",required:true,defaultValue:{type:"OPERATIONAL_TODAY",calendarAppViewId:f.view}}],datasets:[{id:"daily",source:{type:"ENTITY",entityTypeId:f.target},filters:[{type:"PANEL_FILTER",filterId:"day",fieldId:f.date,operator:"EQ"}],transformation:{type:"RECORDS",fieldIds:[f.subject,f.date,f.state,f.context],pagination:{pageSize:25}}},{id:"history",source:{type:"ENTITY",entityTypeId:f.target},transformation:{type:"RECORDS",fieldIds:[f.subject,f.date,f.state,f.context],pagination:{pageSize:25}}}],metrics:[],calculatedFields:[],modules:[{id:"daily-table",title:"Detalle diario",datasetId:"daily",layout:{x:0,y:0,w:12,h:8},visualization:{type:"TABLE",config:{columns:[{fieldId:f.subject},{fieldId:f.date},{fieldId:f.state},{fieldId:f.context}],paginated:true}}},{id:"historical-table",title:"Historial independiente",datasetId:"history",layout:{x:0,y:8,w:12,h:8},visualization:{type:"TABLE",config:{columns:[{fieldId:f.subject},{fieldId:f.date}],paginated:true}}}]};
 const form=new FormData();for(const[k,v]of Object.entries({name:"Panel operativo sintético",slug:"panel-operativo",type:"PANEL",active:"on",panelConfig:JSON.stringify(config)}))form.set(k,v);const panel=await createAppView(ids.contract,ids.user,getAppViewInput(form));if(!panel)throw Error();await prisma.userAppViewAccess.create({data:{userId:ids.user,contractId:ids.contract,appViewId:panel.id}});
 const query=(datasetId:string,date:string)=>getApiPanel({appViewId:panel.id,contractId:ids.contract,userId:ids.user,consumerFeatures:PANEL_FEATURES,query:{datasetId,filters:JSON.stringify({day:date})}});
 const a=await query("daily",day),empty=await query("daily","2026-01-01"),h1=await query("history",day),h2=await query("history","2026-01-01");expect(a.ok&&empty.ok&&h1.ok&&h2.ok).toBe(true);if(!a.ok||!empty.ok||!h1.ok||!h2.ok)throw Error(await errorText(a));
 expect(a.data.datasets[0].rows.length).toBeGreaterThan(0);expect(empty.data.datasets[0].rows).toEqual([]);expect(h1.data.datasets).toEqual(h2.data.datasets);
 expect(a.data.filters[0].defaultValue).toMatchObject({type:"OPERATIONAL_TODAY",calendar:calendar(f),calendarKey:operationalCalendarKey(calendar(f))});
 const old=await getApiPanel({appViewId:panel.id,contractId:ids.contract,userId:ids.user,consumerFeatures:PANEL_FEATURES.filter(f=>f!=="operational-day-v1"),query:{}});expect(old.ok).toBe(false);if(!old.ok)expect(old.response.status).toBe(426);
 if(process.env.OPERATIONAL_FIXTURE_FILE){const{readFileSync}=await import("node:fs");const file=process.env.OPERATIONAL_FIXTURE_FILE;writeFileSync(file,JSON.stringify({...JSON.parse(readFileSync(file,"utf8")),panelId:panel.id}));}
 });
});
