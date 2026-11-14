import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./prisma";
const suite=process.env.OFFLINE_REVISION_PG==="1"?describe.sequential:describe.skip;
const prefix="revision_race_"+randomUUID().replaceAll("-","").slice(0,10),id=(s:string)=>prefix+"_"+s;
beforeAll(async()=>{if(process.env.OFFLINE_REVISION_PG!=="1")return;const u=new URL(process.env.DATABASE_URL??"");if(u.hostname!=="127.0.0.1"||u.port!=="19543"||u.pathname!=="/opco_revision_shadow")throw Error("ISOLATED_REVISION_DATABASE_REQUIRED");await prisma.organization.create({data:{id:id("org"),name:"Synthetic revision race",slug:id("org")}});await prisma.contract.create({data:{id:id("contract"),organizationId:id("org"),name:"Synthetic race",code:id("contract"),slug:id("contract")}});for(const e of["a","b"])await prisma.entityType.create({data:{id:id(e),contractId:id("contract"),name:id(e),slug:id(e)}});});
afterAll(async()=>{await prisma.$disconnect();});
suite("revision commit lock ordering",()=>{
 it("does not introduce a counter deadlock for opposite entity order and disjoint business rows",async()=>{
  let entered=0,release!:()=>void;const both=new Promise<void>(r=>{release=r;});
  const write=(n:number,first:string,second:string)=>prisma.$transaction(async tx=>{
   await tx.entityRecord.create({data:{id:id("r"+n+first),entityTypeId:id(first),displayName:"Synthetic one"}});
   entered++;if(entered===2)release();await both;
   await tx.entityRecord.create({data:{id:id("r"+n+second),entityTypeId:id(second),displayName:"Synthetic two"}});
  },{timeout:10000});
  const results=await Promise.allSettled([write(1,"a","b"),write(2,"b","a")]);
  if(process.env.OFFLINE_REVISION_RACE_METRICS)writeFileSync(process.env.OFFLINE_REVISION_RACE_METRICS,JSON.stringify({results:results.map(result=>result.status),errors:results.flatMap(result=>result.status==="rejected"?[{code:result.reason?.code,deadlock:/deadlock/i.test(String(result.reason?.message))}]:[])}));
  expect(results.map(result=>result.status)).toEqual(["fulfilled","fulfilled"]);
  expect(await prisma.entityRecord.count({where:{entityTypeId:{in:[id("a"),id("b")]}}})).toBe(4);
 });
});
