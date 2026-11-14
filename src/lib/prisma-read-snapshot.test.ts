import { PrismaClient, type Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { runPrismaReadSnapshot, snapshotPrismaClient } from "./prisma-read-snapshot";
function fixture() {
  const tx={ $executeRaw:vi.fn().mockResolvedValue(0), entityRecord:{findMany:vi.fn().mockResolvedValue(["snapshot"])} };
  const root={entityRecord:{findMany:vi.fn().mockResolvedValue(["root"])},$transaction:vi.fn(async(work:(tx:Prisma.TransactionClient)=>Promise<unknown>)=>work(tx as unknown as Prisma.TransactionClient))};
  return {tx,root:root as unknown as PrismaClient,client:snapshotPrismaClient(root as unknown as PrismaClient)};
}
describe("explicit read snapshot Prisma scope",()=>{
  it("uses root outside and the transaction throughout awaited nested readers",async()=>{
    const f=fixture();expect(await f.client.entityRecord.findMany()).toEqual(["root"]);
    await runPrismaReadSnapshot(f.root,async()=>{await Promise.resolve();expect(await f.client.entityRecord.findMany()).toEqual(["snapshot"]);});
    expect(await f.client.entityRecord.findMany()).toEqual(["root"]);expect(f.root.$transaction).toHaveBeenCalledWith(expect.any(Function),expect.objectContaining({isolationLevel:"RepeatableRead"}));expect(f.tx.$executeRaw).toHaveBeenCalledOnce();
  });
  it("does not leak into an unrelated concurrent writer/reader and restores after failure",async()=>{
    const f=fixture();let release!:()=>void,entered!:()=>void;const ready=new Promise<void>(r=>{entered=r;});const wait=new Promise<void>(r=>{release=r;});
    const read=runPrismaReadSnapshot(f.root,async()=>{entered();await wait;expect(await f.client.entityRecord.findMany()).toEqual(["snapshot"]);throw Error("synthetic failure");});
    await ready;expect(await f.client.entityRecord.findMany()).toEqual(["root"]);release();await expect(read).rejects.toThrow("synthetic failure");expect(await f.client.entityRecord.findMany()).toEqual(["root"]);
  });
  it("prevents nested transaction or connection escape from the explicit read scope",async()=>{
    const f=fixture();await runPrismaReadSnapshot(f.root,async()=>{
      expect(()=>f.client.$transaction).toThrow("READ_SNAPSHOT_CLIENT_ESCAPE");expect(()=>f.client.$disconnect).toThrow("READ_SNAPSHOT_CLIENT_ESCAPE");await expect(runPrismaReadSnapshot(f.root,async()=>0)).rejects.toThrow("NESTED_READ_SNAPSHOT");
    });
  });
});
