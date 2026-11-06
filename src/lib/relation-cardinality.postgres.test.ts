import {randomUUID} from "node:crypto";
import {beforeAll,afterAll,describe,it,expect} from "vitest";
import {prisma} from "./prisma";
import {createEntityField,createEntityFieldWithOptions,updateEntityField,updateEntityFieldWithOptions,getEntityFieldInput} from "./entity-config";
import {getRelationConfig} from "./field-validation";
import {syncEntityRelations} from "./entity-records";
import {lockWritePolicyTargets} from "./workflow-write-policy";
import {createApiEntityRecord} from "./api-record-writes";
import {getApiEntityDefinition} from "./api-entities";
import {assertRelationFieldEdit,assertRelationMutationCardinality} from "./relation-cardinality-write";
import {serializeApiEntityRecord} from "./api-entity-serializer";
const suite=process.env.RELATION_CARDINALITY_PG==="1"?describe.sequential:describe.skip;
const prefix="cardinality_"+randomUUID().replaceAll("-","").slice(0,12),id=(s:string)=>prefix+"_"+s;
const f={app:id("app"),org:id("org"),user:id("admin"),member:id("member"),contract:id("contract"),source:id("source"),target:id("catalog"),one:id("one"),many:id("many"),legacy:id("legacy"),r:id("r"),a:id("a"),b:id("b")};let validated=false;
function input(kind:"ONE"|"MANY", key="relation", confirm=false){const form=new FormData();for(const [name,value]of Object.entries({name:"Synthetic relation",key,type:"RELATION",isActive:"true",targetEntityTypeId:f.target,relationKind:kind,multiple:String(kind==="MANY"),confirmRelationCardinality:String(confirm)}))form.set(name,value);return getEntityFieldInput(form);}
async function links(fieldId:string){return prisma.entityRelation.findMany({where:{sourceFieldId:fieldId},orderBy:{targetRecordId:"asc"}});}
suite("RELATION cardinality on validated local PostgreSQL",()=>{
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL??"");if(url.hostname!=="127.0.0.1"||url.port!=="5432"||url.pathname!=="/opco_development"||decodeURIComponent(url.username)!=="opco_dev")throw Error("LOCAL_DATABASE_REQUIRED");
  const [db]=await prisma.$queryRaw<Array<{database:string;role:string;address:string}>>`SELECT current_database() AS database,current_user AS role,inet_server_addr()::text AS address`;
  expect(db).toEqual({database:"opco_development",role:"opco_dev",address:"127.0.0.1/32"});validated=true;
  await prisma.organization.create({data:{id:f.org,name:"Synthetic cardinality",slug:f.org}});
  for(const user of[f.user,f.member]){await prisma.user.create({data:{id:user,email:user+"@example.invalid",passwordHash:"synthetic-no-login"}});await prisma.membership.create({data:{organizationId:f.org,userId:user,role:user===f.user?"ADMIN":"MEMBER"}});}
  await prisma.externalApp.create({data:{id:f.app,organizationId:f.org,clientId:f.app,name:"Synthetic Client",slug:f.app}});
  await prisma.contract.create({data:{id:f.contract,organizationId:f.org,name:"Synthetic cardinality",code:f.contract,slug:f.contract}});
  for(const entity of[f.source,f.target])await prisma.entityType.create({data:{id:entity,contractId:f.contract,name:"Synthetic "+entity,slug:entity}});
  await prisma.entityField.createMany({data:[{id:f.one,key:"one",multiple:false,config:{relationKind:"ONE",targetEntityTypeId:f.target}},{id:f.many,key:"many",multiple:true,config:{relationKind:"MANY",targetEntityTypeId:f.target}},{id:f.legacy,key:"legacy",multiple:true,config:{relation:{relationKind:"ONE",targetEntityTypeId:f.target},unknown:{preserve:true}}}].map(field=>({...field,entityTypeId:f.source,type:"RELATION",name:"Synthetic relation"}))});
  for(const record of[f.r,f.a,f.b])await prisma.entityRecord.create({data:{id:record,entityTypeId:record===f.r?f.source:f.target,displayName:"Synthetic record"}});
 });
 afterAll(async()=>{try{if(validated){await prisma.apiIdempotencyKey.deleteMany({where:{contractId:f.contract}});await prisma.auditEvent.deleteMany({where:{contractId:f.contract}});await prisma.entityRelation.deleteMany({where:{sourceRecord:{entityType:{contractId:f.contract}}}});await prisma.organization.deleteMany({where:{id:f.org}});await prisma.user.deleteMany({where:{id:{in:[f.user,f.member]}}});expect(await prisma.organization.count({where:{id:f.org}})).toBe(0);}}finally{await prisma.$disconnect();}});
 it("creates both kinds through supported persistence and rejects direct contradictory inputs before mutation",async()=>{
  for(const kind of["ONE","MANY"]as const)for(const withOptions of[false,true]){const value=input(kind,kind.toLowerCase()+"_"+String(withOptions));const field=withOptions?await createEntityFieldWithOptions(f.contract,f.source,f.user,value,[]):await createEntityField(f.contract,f.source,f.user,value);expect(field?.multiple).toBe(kind==="MANY");expect(getRelationConfig(field?.config).relationKind).toBe(kind);}
  const count=await prisma.entityField.count({where:{entityTypeId:f.source}});
  for(const create of[createEntityField,(c:string,e:string,u:string,v:ReturnType<typeof input>)=>createEntityFieldWithOptions(c,e,u,v,[])])await expect(create(f.contract,f.source,f.user,{...input("ONE","invalid"),multiple:true})).rejects.toThrow("cardinalidad");
  expect(await prisma.entityField.count({where:{entityTypeId:f.source}})).toBe(count);
 });
 it("reads contradictory history without repair, accepts its valid ONE command, and requires explicit confirmation to edit its definition",async()=>{
  const before=await prisma.entityField.findUniqueOrThrow({where:{id:f.legacy}});
  await prisma.$transaction(tx=>syncEntityRelations(tx,f.r,[{fieldId:f.legacy,targetRecordIds:[f.a]}]));
  expect(await prisma.entityField.findUniqueOrThrow({where:{id:f.legacy}})).toEqual(before);
  const priorLinks=await links(f.legacy);await expect(updateEntityField(f.contract,f.source,f.legacy,f.user,input("ONE","legacy"))).rejects.toThrow("explícitamente");
  expect(await prisma.entityField.findUniqueOrThrow({where:{id:f.legacy}})).toEqual(before);expect(await links(f.legacy)).toEqual(priorLinks);
  const edited=await updateEntityField(f.contract,f.source,f.legacy,f.user,input("ONE","legacy",true));expect(edited?.multiple).toBe(false);expect(edited?.config).toMatchObject({unknown:{preserve:true},relationKind:"ONE",relation:{relationKind:"ONE"}});expect(await links(f.legacy)).toEqual(priorLinks);
 });
 it("rejects reducing MANY to ONE in both update doors without touching fields, records or links",async()=>{
  await prisma.$transaction(tx=>syncEntityRelations(tx,f.r,[{fieldId:f.many,targetRecordIds:[f.a,f.b]}]));const before=await prisma.entityField.findUniqueOrThrow({where:{id:f.many}}),beforeLinks=await links(f.many);
  for(const update of[updateEntityField,(c:string,e:string,field:string,u:string,v:ReturnType<typeof input>)=>updateEntityFieldWithOptions(c,e,field,u,v,[])])await expect(update(f.contract,f.source,f.many,f.user,input("ONE","many"))).rejects.toThrow("varias relaciones");
  expect(await prisma.entityField.findUniqueOrThrow({where:{id:f.many}})).toEqual(before);expect(await links(f.many)).toEqual(beforeLinks);
 });
 it("allows an explicit safe reduction after there is at most one link; old multi-value writes are rejected transactionally",async()=>{
  await prisma.$transaction(tx=>syncEntityRelations(tx,f.r,[{fieldId:f.many,targetRecordIds:[f.a]}]));const before=await links(f.many);
  await updateEntityFieldWithOptions(f.contract,f.source,f.many,f.user,input("ONE","many"),[]);
  await expect(prisma.$transaction(tx=>syncEntityRelations(tx,f.r,[{fieldId:f.many,targetRecordIds:[f.a,f.b]}]))).rejects.toThrow("solo una relación");expect(await links(f.many)).toEqual(before);
 });
 it("a concurrent writer holding the destination lock cannot race a reduction",async()=>{
  await updateEntityField(f.contract,f.source,f.many,f.user,input("MANY","many"));
  let release!:()=>void,started!:()=>void;const held=new Promise<void>(r=>{release=r;}),ready=new Promise<void>(r=>{started=r;});
  const writer=prisma.$transaction(async tx=>{await lockWritePolicyTargets(tx,[f.source]);started();await held;await syncEntityRelations(tx,f.r,[{fieldId:f.many,targetRecordIds:[f.a,f.b]}]);});
  await ready;const reduction=updateEntityField(f.contract,f.source,f.many,f.user,input("ONE","many"));release();await writer;await expect(reduction).rejects.toThrow("varias relaciones");expect(await links(f.many)).toHaveLength(2);
 });
 it("an imported stale multi-value plan is checked against the live field after its destination lock",async()=>{
  await prisma.$transaction(tx=>syncEntityRelations(tx,f.r,[{fieldId:f.many,targetRecordIds:[f.a]}]));await updateEntityField(f.contract,f.source,f.many,f.user,input("ONE","many"));
  await expect(prisma.$transaction(async tx=>{await lockWritePolicyTargets(tx,[f.source]);await assertRelationMutationCardinality(tx,[{fieldId:f.many,targetRecordIds:[f.a,f.b]}]);})).rejects.toThrow("solo una relación");expect(await links(f.many)).toHaveLength(1);
 });
 it("a stale writer resumes after a committed reduction and cannot restore several links",async()=>{
  await updateEntityField(f.contract,f.source,f.many,f.user,input("MANY","many"));
  let release!:()=>void,started!:()=>void;const held=new Promise<void>(r=>{release=r;}),ready=new Promise<void>(r=>{started=r;});
  const reduction=prisma.$transaction(async tx=>{await assertRelationFieldEdit(tx,f.source,f.many,input("ONE","many"));started();await held;await tx.entityField.update({where:{id:f.many},data:{multiple:false,config:{relationKind:"ONE",targetEntityTypeId:f.target}}});});
  await ready;const writer=prisma.$transaction(tx=>syncEntityRelations(tx,f.r,[{fieldId:f.many,targetRecordIds:[f.a,f.b]}]));release();await reduction;await expect(writer).rejects.toThrow("solo una relación");expect(await links(f.many)).toHaveLength(1);
 });
 it("accepts an old single-element array on the real generic API write path and replays without duplication",async()=>{
  const entity=await getApiEntityDefinition(f.contract,f.source);if(!entity)throw Error("Synthetic metadata missing");
  const body={clientRequestId:id("old_array_request"),values:{many:[f.a]}};
  const first=await createApiEntityRecord({appId:f.app,contractId:f.contract,entity,userId:f.user,body});expect(first.ok).toBe(true);if(!first.ok)throw Error("Synthetic old command rejected");
  const second=await createApiEntityRecord({appId:f.app,contractId:f.contract,entity,userId:f.user,body});expect(second).toMatchObject({ok:true,replay:true,recordId:first.recordId});
  const records=await prisma.entityRecord.findMany({where:{entityTypeId:f.source,id:first.recordId},include:{outgoingRelations:true}});expect(records).toHaveLength(1);expect(records[0].outgoingRelations).toEqual([expect.objectContaining({sourceFieldId:f.many,targetRecordId:f.a})]);
 });
 it("keeps permissions and every stored target when an old ONE record is already inconsistent",async()=>{
  const old=await prisma.entityField.findUniqueOrThrow({where:{id:f.one}});await expect(updateEntityField(f.contract,f.source,f.one,f.member,input("MANY","one"))).resolves.toBeNull();expect(await prisma.entityField.findUniqueOrThrow({where:{id:f.one}})).toEqual(old);
  await prisma.entityRelation.createMany({data:[f.a,f.b].map(targetRecordId=>({sourceRecordId:f.r,sourceFieldId:f.one,targetRecordId}))});
  const record=await prisma.entityRecord.findUniqueOrThrow({where:{id:f.r},include:{values:true,outgoingRelations:{include:{targetRecord:{select:{id:true,entityTypeId:true,displayName:true}}}}}});
  const serialized=serializeApiEntityRecord({record,fields:[{...old,options:[]}]});expect(serialized.values.one).toEqual(expect.arrayContaining([expect.objectContaining({id:f.a}),expect.objectContaining({id:f.b})]));
  expect(await links(f.one)).toHaveLength(2);
 });
});
