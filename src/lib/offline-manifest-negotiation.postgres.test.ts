import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("./prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient() };
});
import { prisma } from "./prisma";
import { signApiAccessToken } from "./api-auth";
import { buildOfflineManifest, getOfflineManifest, offlineManifestHash, parseOfflineManifestRequest } from "./offline-manifest";
import { GET } from "../app/api/v1/contracts/[contractId]/offline/manifest/route";

const suite = process.env.OFFLINE_NEGOTIATION_PG === "1" ? describe.sequential : describe.skip;
const prefix = "negotiation_" + randomUUID().replaceAll("-", "").slice(0, 10);
const id = (part: string) => prefix + "_" + part;
const f = { org: id("org"), user: id("user"), member: id("member"), app: id("app"), contract: id("contract"), other: id("other"), entity: id("entity"), view: id("view"), record: id("record") };
const baseQuery = "version=2&nonce=event_0123456789abcdef&readRepresentationVersion=1&receiptVersion=1&storagePolicyVersion=1&date=2026-11-13&month=2026-11";
const query = (extra = "") => parseOfflineManifestRequest(new URLSearchParams(baseQuery + extra));
const scope = () => ({ appId: f.app, userId: f.user, contractId: f.contract });
const manifest = (extra = "") => getOfflineManifest(scope(), query(extra));
type Manifest = Awaited<ReturnType<typeof getOfflineManifest>>;
function expected(m: Manifest) {
  return `&expectedScopeFingerprint=${offlineManifestHash(m.scope)}&expectedManifestVectorRevision=${m.readBindingVector.revision}&expectedEpoch=${m.epoch}&expectedDefinitionsRevision=${m.readDefinitionsRevision}`;
}

suite("offline negotiation on isolated PostgreSQL", () => {
  let token: string;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (url.hostname !== "127.0.0.1" || url.port !== "19973" || url.pathname !== "/opco_negotiation" || url.username !== "negotiation_owner") throw Error("ISOLATED_NEGOTIATION_DATABASE_REQUIRED");
    const [db] = await prisma.$queryRaw<Array<{ database: string; address: string }>>`SELECT current_database() AS database, inet_server_addr()::text AS address`;
    expect(db).toEqual({ database: "opco_negotiation", address: "127.0.0.1/32" });
    await prisma.organization.create({ data: { id: f.org, name: "Synthetic negotiation", slug: f.org } });
    for (const user of [f.user, f.member]) {
      await prisma.user.create({ data: { id: user, email: user + "@example.invalid" } });
      await prisma.membership.create({ data: { organizationId: f.org, userId: user, role: "MEMBER" } });
    }
    await prisma.externalApp.create({ data: { id: f.app, organizationId: f.org, clientId: f.app, name: "Synthetic negotiation", slug: f.app } });
    for (const contract of [f.contract, f.other]) await prisma.contract.create({ data: { id: contract, organizationId: f.org, name: "Synthetic", code: contract, slug: contract } });
    await prisma.entityType.create({ data: { id: f.entity, contractId: f.contract, name: "Synthetic", slug: f.entity } });
    await prisma.entityRecord.create({ data: { id: f.record, entityTypeId: f.entity, displayName: "Synthetic before" } });
    await prisma.appView.create({ data: { id: f.view, contractId: f.contract, type: "RECORDS", name: "Synthetic", slug: f.view, config: { entityTypeId: f.entity } } });
    await prisma.userAppViewAccess.create({ data: { userId: f.user, contractId: f.contract, appViewId: f.view } });
    token = await signApiAccessToken({ app: await prisma.externalApp.findUniqueOrThrow({ where: { id: f.app } }), user: await prisma.user.findUniqueOrThrow({ where: { id: f.user } }) });
  });
  afterAll(async () => {
    // The fixture has its own namespace; no other contract/user is removed.
    await prisma.organization.deleteMany({ where: { id: f.org } });
    await prisma.user.deleteMany({ where: { id: { in: [f.user, f.member] } } });
    await prisma.$disconnect();
  });

  it("retains v1 data and hashes while v2 adds a compatibility-only descriptor", async () => {
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const old = await buildOfflineManifest(tx, scope(), parseOfflineManifestRequest(new URLSearchParams("date=2026-11-13&month=2026-11")));
      const current = await buildOfflineManifest(tx, scope(), query());
      const withoutEnvelope = (m: Manifest) => { const { version, manifestRevision, negotiation, ...data } = m; void version; void manifestRevision; void negotiation; return data; };
      expect(withoutEnvelope(current)).toEqual(withoutEnvelope(old));
      expect(Object.hasOwn(old, "negotiation")).toBe(false);
      expect(current).toMatchObject({ version: 2, mode: "shadow", reuseAllowed: false, capabilities: { clientMaySkipReads: false } });
      expect(current.negotiation).toMatchObject({ version: 1, nonce: "event_0123456789abcdef", status: "compatible", issues: [], comparison: { epoch: "not-requested" }, compatibilityOnly: true, reuseAllowed: false, clientMaySkipReads: false, localReceiptVerified: false, storageIdentityVerified: false, coverageCertified: false });
      expect(current.readBindingVector.revision).toBe(old.readBindingVector.revision);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  });

  it("offers policy2 only to opted-in assigned Attendance and preserves policy1 shadow", async () => {
    const pilot=id("pilot");
    await prisma.appView.create({data:{id:pilot,contractId:f.contract,type:"WORKFLOW",name:"Synthetic conditional pilot",slug:pilot,config:{workflowKey:"attendance",sourceEntityTypeId:f.entity,targetEntityTypeId:f.entity,personFieldId:"person",dateFieldId:"date",statusFieldId:"status",defaultCheckInOptionId:"present"}}});
    await prisma.userAppViewAccess.create({data:{userId:f.user,contractId:f.contract,appViewId:pilot}});
    const q=()=>parseOfflineManifestRequest(new URLSearchParams(baseQuery.replace("storagePolicyVersion=1","storagePolicyVersion=2")));
    try{
      expect((await getOfflineManifest(scope(),q())).negotiation).toMatchObject({reuseAllowed:false,selectiveReuse:{enabled:false,appViewIds:[]}});
      vi.stubEnv("OPCO_OFFLINE_REUSE_POLICY","attendance-runtime-v1");vi.stubEnv("OPCO_OFFLINE_REUSE_CONTRACT_IDS",f.contract);
      const enabled=await getOfflineManifest(scope(),q());
      expect(enabled.negotiation).toMatchObject({reuseAllowed:true,clientMaySkipReads:true,coverageCertified:false,localReceiptVerified:false,selectiveReuse:{enabled:true,appViewIds:[pilot]}});
      expect((await manifest()).negotiation).toMatchObject({reuseAllowed:false,clientMaySkipReads:false,compatibilityOnly:true});
      expect((await getOfflineManifest({...scope(),userId:f.member},q())).negotiation).toMatchObject({reuseAllowed:false,selectiveReuse:{appViewIds:[]}});
      vi.stubEnv("OPCO_OFFLINE_REUSE_CONTRACT_IDS",f.other);
      expect((await getOfflineManifest(scope(),q())).negotiation?.reuseAllowed).toBe(false);
    }finally{vi.unstubAllEnvs();await prisma.appView.delete({where:{id:pilot}});}
  });

  it("confirms supplied expectations without claiming local coverage or physical storage", async () => {
    const a = await manifest(), b = await manifest(expected(a));
    expect(b.negotiation).toMatchObject({ status: "compatible", issues: [], comparison: { epoch: "match", scopeFingerprint: "match", manifestVectorRevision: "match", definitionsRevision: "match" }, localReceiptVerified: false, storageIdentityVerified: false });
  });

  it("binds nonce, period and requested view selection without perturbing the data vector", async () => {
    const a = await manifest();
    const changes = [baseQuery.replace("event_0123456789abcdef", "event_fedcba9876543210"), baseQuery.replace("2026-11-13", "2026-11-14"), baseQuery.replaceAll("2026-11", "2026-12"), baseQuery + "&appViewId=" + f.view];
    for (const value of changes) {
      const b = await getOfflineManifest(scope(), parseOfflineManifestRequest(new URLSearchParams(value)));
      expect(b.negotiation?.requestFingerprint).not.toBe(a.negotiation?.requestFingerprint);
      expect(b.readBindingVector.revision).toBe(a.readBindingVector.revision);
    }
    const nonceChanged = await getOfflineManifest(scope(), parseOfflineManifestRequest(new URLSearchParams(changes[0])));
    expect(nonceChanged.negotiation?.nonce).toBe("event_fedcba9876543210");
    expect(nonceChanged.manifestRevision).toBe(a.manifestRevision);
  });

  it.each(["readRepresentationVersion", "receiptVersion", "storagePolicyVersion"])("rejects unsupported %s diagnostically", async key => {
    const m = await getOfflineManifest(scope(), parseOfflineManifestRequest(new URLSearchParams(baseQuery.replace(key + "=1", key + "=3"))));
    expect(m.negotiation?.status).toBe("incompatible");
    expect(m.negotiation?.issues).toHaveLength(1);
    expect(m.reuseAllowed).toBe(false);
  });

  it("identifies incorrect expectations explicitly", async () => {
    const m = await manifest("&expectedScopeFingerprint=" + "0".repeat(64) + "&expectedManifestVectorRevision=" + "0".repeat(64) + "&expectedEpoch=old_epoch&expectedDefinitionsRevision=" + "0".repeat(64));
    expect(m.negotiation).toMatchObject({ status: "incompatible", comparison: { scopeFingerprint: "mismatch", manifestVectorRevision: "mismatch", epoch: "mismatch", definitionsRevision: "mismatch" } });
    expect(m.negotiation?.issues).toEqual(["SCOPE_MISMATCH", "REVISION_MISMATCH", "EPOCH_MISMATCH", "DEFINITION_MISMATCH"]);
  });

  it("detects committed changes and excludes rolled-back changes", async () => {
    const a = await manifest();
    await expect(prisma.$transaction(async tx => { await tx.entityRecord.update({ where: { id: f.record }, data: { displayName: "Synthetic rolled back" } }); throw Error("Synthetic rollback"); })).rejects.toThrow("Synthetic rollback");
    expect((await manifest(expected(a))).negotiation?.status).toBe("compatible");
    await prisma.entityRecord.update({ where: { id: f.record }, data: { displayName: "Synthetic committed" } });
    expect((await manifest(expected(a))).negotiation?.issues).toContain("REVISION_MISMATCH");
  });

  it("keeps metadata, permissions and data in the same snapshot during concurrent writes", async () => {
    let release!: () => void, entered!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    let previous!: Manifest;
    const read = prisma.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      previous = await buildOfflineManifest(tx, scope(), query());
      entered(); await hold;
      const again = await buildOfflineManifest(tx, scope(), query(expected(previous)));
      expect(again.negotiation?.status).toBe("compatible");
      expect(again.readBindingVector).toEqual(previous.readBindingVector);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 10000 });
    try {
      await Promise.race([ready, read]);
      await prisma.$transaction(async tx => {
        await tx.entityRecord.update({ where: { id: f.record }, data: { displayName: "Synthetic concurrent" } });
        await tx.appView.update({ where: { id: f.view }, data: { name: "Synthetic concurrent definition" } });
        await tx.membership.update({ where: { userId_organizationId: { userId: f.user, organizationId: f.org } }, data: { role: "ADMIN" } });
      });
    } finally { release(); }
    await read;
    expect((await manifest(expected(previous))).negotiation?.issues).toEqual(expect.arrayContaining(["SCOPE_MISMATCH", "REVISION_MISMATCH", "DEFINITION_MISMATCH"]));
  });

  it("isolates users, contracts and inactive or unassigned views", async () => {
    const a = await manifest();
    for (const other of [{ ...scope(), userId: f.member }, { ...scope(), contractId: f.other }]) {
      const b = await getOfflineManifest(other, query(expected(a)));
      expect(b.negotiation?.issues).toContain("SCOPE_MISMATCH");
    }
    await expect(getOfflineManifest({ ...scope(), userId: f.member }, query("&appViewId=" + f.view))).rejects.toMatchObject({ status: 403 });
    await prisma.appView.update({ where: { id: f.view }, data: { active: false } });
    try { await expect(manifest("&appViewId=" + f.view)).rejects.toMatchObject({ status: 403 }); }
    finally { await prisma.appView.update({ where: { id: f.view }, data: { active: true } }); }
  });

  it("compares a new epoch without performing a rotation in the endpoint", async () => {
    const a = await manifest();
    await prisma.$executeRaw`UPDATE "OfflineRevisionEpoch" SET epoch=${randomUUID()} WHERE id='v1'`;
    expect((await manifest(expected(a))).negotiation?.issues).toContain("EPOCH_MISMATCH");
    expect((await manifest()).negotiation?.status).toBe("compatible");
  });

  it("returns unavailable for incomplete tracking and never certifies it", async () => {
    await prisma.$executeRawUnsafe('ALTER TABLE "EntityRecord" DISABLE TRIGGER "opco_offline_revision_entityrecord_insert"');
    try { expect((await manifest()).negotiation).toMatchObject({ status: "unavailable", issues: ["REVISION_TRACKING_UNAVAILABLE"], reuseAllowed: false }); }
    finally { await prisma.$executeRawUnsafe('ALTER TABLE "EntityRecord" ENABLE ALWAYS TRIGGER "opco_offline_revision_entityrecord_insert"'); }
  });

  it("authenticates the actual route, denies revoked access and keeps success and parser errors no-store", async () => {
    const url = "http://localhost/api/v1/contracts/" + f.contract + "/offline/manifest?" + baseQuery;
    const context = { params: Promise.resolve({ contractId: f.contract }) };
    const denied = await GET(new Request(url), context);
    expect(denied.status).toBe(401); expect(denied.headers.get("Cache-Control")).toBe("no-store");
    const request = (suffix = "") => new Request(url + suffix, { headers: { Authorization: "Bearer " + token } });
    const response = await GET(request(), context);
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).data.negotiation.status).toBe("compatible");
    const invalid = await GET(request("&nonce=duplicated"), context);
    expect(invalid.status).toBe(400); expect(invalid.headers.get("Cache-Control")).toBe("no-store");
    await prisma.user.update({ where: { id: f.user }, data: { active: false } });
    try { expect((await GET(request(), context)).status).toBe(401); }
    finally { await prisma.user.update({ where: { id: f.user }, data: { active: true } }); }
  });
});
