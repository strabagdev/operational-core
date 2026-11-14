import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync,writeFileSync } from "node:fs";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { prisma } from "./prisma";
import { getOfflineManifest,parseOfflineManifestRequest } from "./offline-manifest";
import { signApiAccessToken } from "./api-auth";
import { GET } from "../app/api/v1/contracts/[contractId]/offline/manifest/route";
import { GET as recordsGET } from "../app/api/v1/contracts/[contractId]/entities/[entityTypeId]/records/route";
const suite=process.env.OFFLINE_REVISION_PG==="1"?describe.sequential:describe.skip;
const prefix="revision_recovery_"+randomUUID().replaceAll("-","").slice(0,10),id=(key:string)=>prefix+"_"+key;
let token="";
const read=()=>getOfflineManifest({appId:id("app"),userId:id("user"),contractId:id("contract")},parseOfflineManifestRequest(new URLSearchParams()));
const tables=["Organization","Contract","User","Membership","ExternalApp","AppView","UserAppViewAccess","EntityType","EntityField","FieldOption","EntityRecord","EntityValue","EntityRelation","StateUpdateIdentityDefinition","StateUpdateIdentitySlot","ApiIdempotencyKey","AuditEvent","AuditChange","_prisma_migrations"];
async function businessHashes(){const rows=[];for(const table of tables){const[value]=await prisma.$queryRawUnsafe<Array<{n:bigint;hash:string}>>('SELECT count(*) AS n,md5(COALESCE(string_agg(to_jsonb(t)::text,E\'\\n\' ORDER BY id),\'\')) AS hash FROM "'+table+'" t');rows.push({table,count:Number(value.n),hash:value.hash});}return rows;}
beforeAll(async()=>{
 if(process.env.OFFLINE_REVISION_PG!=="1")return;const u=new URL(process.env.DATABASE_URL??"");if(u.hostname!=="127.0.0.1"||u.port!=="19543"||u.pathname!=="/opco_revision_shadow")throw Error("ISOLATED_REVISION_DATABASE_REQUIRED");
 await prisma.organization.create({data:{id:id("org"),name:"Synthetic migration recovery",slug:id("org")}});const user=await prisma.user.create({data:{id:id("user"),email:id("user")+"@example.invalid",passwordHash:"synthetic-no-login"}});await prisma.membership.create({data:{organizationId:id("org"),userId:user.id,role:"ADMIN"}});const app=await prisma.externalApp.create({data:{id:id("app"),organizationId:id("org"),clientId:id("app"),name:"Synthetic app",slug:id("app")}});await prisma.contract.create({data:{id:id("contract"),organizationId:id("org"),code:id("contract"),name:"Synthetic contract",slug:id("contract")}});await prisma.entityType.create({data:{id:id("type"),contractId:id("contract"),name:"Synthetic records",slug:id("type")}});await prisma.entityRecord.create({data:{entityTypeId:id("type"),displayName:"Synthetic retained"}});const view=await prisma.appView.create({data:{id:id("view"),contractId:id("contract"),name:"Synthetic records",slug:id("view"),type:"RECORDS",config:{entityTypeId:id("type")}}});await prisma.userAppViewAccess.create({data:{userId:user.id,contractId:id("contract"),appViewId:view.id}});token=await signApiAccessToken({app,user});
});
afterAll(async()=>{await prisma.$disconnect();});
suite("diagnostic revision migration recovery",()=>{
 it("rolls back only new bookkeeping, preserves business/history and disables the diagnostic route until reapplied with a new epoch",async()=>{
  const old=await read(),before=await businessHashes(),connection=process.env.DATABASE_URL!.split("?")[0];
  const sql=(path:string)=>execFileSync("/usr/bin/psql",["-X","-q","-v","ON_ERROR_STOP=1","-d",connection],{input:readFileSync(path),stdio:["pipe","pipe","pipe"]});
  sql("scripts/sql/offline-revision-shadow-rollback.sql");
  try{
   const response=await GET(new Request("http://localhost/offline/manifest",{headers:{Authorization:"Bearer "+token}}),{params:Promise.resolve({contractId:id("contract")})});expect(response.status).toBe(503);expect((await response.json()).error.code).toBe("OFFLINE_MANIFEST_UNAVAILABLE");
   const legacy=await recordsGET(new Request("http://localhost/records",{headers:{Authorization:"Bearer "+token}}),{params:Promise.resolve({contractId:id("contract"),entityTypeId:id("type")})});expect(legacy.status).toBe(200);
   expect(await businessHashes()).toEqual(before);
  }finally{sql("prisma/migrations/20261111193000_offline_revision_shadow/migration.sql");}
  const restored=await read();expect(restored.epoch).not.toBe(old.epoch);expect(restored.manifestRevision).not.toBe(old.manifestRevision);expect(restored.reuseAllowed).toBe(false);expect(restored.tracking.databaseDml).toBe("installed");expect(await businessHashes()).toEqual(before);
  if(process.env.OFFLINE_REVISION_MIGRATION_PROOF)writeFileSync(process.env.OFFLINE_REVISION_MIGRATION_PROOF,JSON.stringify({tables:before,oldEpoch:old.epoch,newEpoch:restored.epoch,businessUnchanged:true,oldApiWithoutBookkeeping:200,shadowWithoutBookkeeping:503,reuseAllowed:false},null,2));
 });
});
