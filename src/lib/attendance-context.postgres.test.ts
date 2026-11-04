import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./prisma";
import { createAppView, getAppViewInput } from "./app-views";
import { getAttendanceWorkflowDay, saveAttendanceWorkflowDay } from "./attendance-workflow";
import { getStateUpdateWorkflow, saveStateUpdateWorkflow } from "./state-update-workflow";

const suite = process.env.ATTENDANCE_CONTEXT_PG === "1" ? describe.sequential : describe.skip;
const prefix = "attctx_" + randomUUID().replaceAll("-", "").slice(0, 12), id = (key: string) => prefix + "_" + key;
const f = { org: id("org"), user: id("admin"), denied: id("denied"), contract: id("contract"), foreignContract: id("foreign_contract"), source: id("source"), target: id("target"), catalog: id("catalog"), foreignCatalog: id("foreign_catalog"), subject: id("subject"), date: id("date"), status: id("status"), relation: id("relation"), choice: id("choice"), a: id("a"), b: id("b"), one: id("one"), p1: id("p1"), p2: id("p2"), c1: id("c1"), c2: id("c2"), foreignRecord: id("foreign_record"), app: id("app"), view: "", day: "2026-11-03" };
let validated = false;
const save = (body: unknown, userId = f.user) => saveStateUpdateWorkflow({ appId: f.app, appViewId: f.view, contractId: f.contract, userId, body });
function request(key: string, subject = f.p1, related: string | null = f.c1, extra = {}) { return { clientRequestId: id(key), date: f.day, subjectRecordId: subject, states: { [f.status]: f.a }, extraValues: { [f.choice]: "canonical-one", [f.relation]: related }, ...extra }; }
function result(r: Awaited<ReturnType<typeof save>>) { if (!r.ok) throw Error("Synthetic request rejected"); return r.data.result; }
async function current(subject = f.p1) {
 const r = await getStateUpdateWorkflow({ appViewId: f.view, contractId: f.contract, userId: f.user, date: f.day, subjectRecordId: subject });
 if (!r.ok) throw Error("Synthetic current rejected"); return r.data.subjects[0].current!;
}
suite("Attendance relation context on validated local PostgreSQL", () => {
 beforeAll(async () => {
  const u = new URL(process.env.DATABASE_URL ?? "");
  if (u.hostname !== "127.0.0.1" || u.port !== "5432" || u.pathname !== "/opco_development" || decodeURIComponent(u.username) !== "opco_dev") throw Error("LOCAL_DATABASE_REQUIRED");
  const [connected] = await prisma.$queryRaw<Array<{ database: string; role: string; address: string }>>`SELECT current_database() AS database,current_user AS role,inet_server_addr()::text AS address`;
  expect(connected).toEqual({ database: "opco_development", role: "opco_dev", address: "127.0.0.1/32" }); validated = true;
  await prisma.organization.create({ data: { id: f.org, name: "Synthetic Attendance context", slug: f.org } });
  for (const user of [f.user, f.denied]) { await prisma.user.create({ data: { id: user, email: user + "@example.invalid", passwordHash: "synthetic-no-login" } }); await prisma.membership.create({ data: { organizationId: f.org, userId: user, role: user === f.user ? "ADMIN" : "MEMBER" } }); }
  for (const contract of [f.contract, f.foreignContract]) await prisma.contract.create({ data: { id: contract, organizationId: f.org, code: contract, name: "Synthetic contract", slug: contract } });
  await prisma.externalApp.create({ data: { id: f.app, organizationId: f.org, clientId: id("client"), name: "Synthetic Client", slug: id("client") } });
  await prisma.entityType.createMany({ data: [f.source, f.target, f.catalog, f.foreignCatalog].map(entity => ({ id: entity, contractId: entity === f.foreignCatalog ? f.foreignContract : f.contract, name: "Synthetic entity " + entity, slug: entity, nature: entity === f.target ? "TRANSACTION" : "MASTER" })) });
  const contextFields = [
   { id: f.subject, key: "subject", type: "RELATION" as const, config: { targetEntityTypeId: f.source, relationKind: "ONE" } },
   { id: f.date, key: "day", type: "DATE" as const, config: {} },
   { id: f.status, key: "status", type: "SELECT" as const, config: {} },
   { id: f.choice, key: "choice", type: "SELECT" as const, config: {} },
   { id: f.relation, key: "relation", type: "RELATION" as const, config: { targetEntityTypeId: f.catalog, relationKind: "ONE" } },
  ];
  for (const field of contextFields) await prisma.entityField.create({ data: { ...field, entityTypeId: f.target, name: "Synthetic " + field.key, required: true } });
  await prisma.fieldOption.createMany({ data: [{ id: f.a, entityFieldId: f.status, label: "A", value: "status-a" }, { id: f.b, entityFieldId: f.status, label: "B", value: "status-b" }, { id: f.one, entityFieldId: f.choice, label: "One", value: "canonical-one" }] });
  for (const [record, entity, label] of [[f.p1, f.source, "Subject one"], [f.p2, f.source, "Subject two"], [f.c1, f.catalog, "Catalog one"], [f.c2, f.catalog, "Catalog two"], [f.foreignRecord, f.foreignCatalog, "Foreign synthetic"]]) await prisma.entityRecord.create({ data: { id: record, entityTypeId: entity, displayName: label } });
  const form = new FormData();
  for (const [key, value] of Object.entries({ type: "WORKFLOW", workflowKey: "attendance", name: "Synthetic relation context", slug: id("view").replaceAll("_", "-"), active: "on", sourceEntityTypeId: f.source, targetEntityTypeId: f.target, personFieldId: f.subject, dateFieldId: f.date, statusFieldId: f.status, defaultCheckInOptionId: f.a })) form.set(key, value);
  form.append("contextFieldIds", f.choice); form.append("contextFieldIds", f.relation);
  const view = await createAppView(f.contract, f.user, getAppViewInput(form)); if (!view) throw Error("Synthetic view denied"); f.view = view.id;
  await prisma.userAppViewAccess.create({ data: { contractId: f.contract, userId: f.user, appViewId: f.view } });
 });
 afterAll(async () => {
  if (validated) {
   await prisma.apiIdempotencyKey.deleteMany({ where: { contractId: f.contract } }); await prisma.auditEvent.deleteMany({ where: { contractId: f.contract } });
   await prisma.entityRelation.deleteMany({ where: { sourceRecord: { entityType: { contractId: { in: [f.contract, f.foreignContract] } } } } });
   await prisma.organization.deleteMany({ where: { id: f.org } }); await prisma.user.deleteMany({ where: { id: { in: [f.user, f.denied] } } });
  }
  await prisma.$disconnect();
 });
 it("editor persists ordered SELECT/RELATION config and metadata without records", async () => {
  const view = await prisma.appView.findUniqueOrThrow({ where: { id: f.view } }); expect(view.config).toMatchObject({ contextFieldIds: [f.choice, f.relation] });
  const r = await getAttendanceWorkflowDay({ appViewId: f.view, contractId: f.contract, userId: f.user, date: f.day }); if (!r.ok) throw Error("Metadata rejected");
  expect(r.data.contextFields[1]).toMatchObject({ id: f.relation, type: "RELATION", config: { relation: { targetEntityTypeId: f.catalog, relationKind: "ONE" } } }); expect(await prisma.entityRecord.count({ where: { entityTypeId: f.target } })).toBe(0);
 });
 it("legacy Attendance save persists the same related context for consecutive subjects and SELECT canonical values", async () => {
  const r = await saveAttendanceWorkflowDay({ appId: f.app, appViewId: f.view, contractId: f.contract, userId: f.user, body: { clientRequestId: id("legacy"), date: f.day, entries: [f.p1, f.p2].map(personRecordId => ({ personRecordId, statusOptionId: f.a, contextValues: { [f.choice]: f.one, [f.relation]: f.c1 } })) } });
  expect(r.ok).toBe(true); if (!r.ok) throw Error("Save rejected"); expect(r.data.results.map(item => item.result)).toEqual(["CREATED", "CREATED"]);
  const records = await prisma.entityRecord.findMany({ where: { entityTypeId: f.target }, include: { outgoingRelations: true, values: true } }); expect(records).toHaveLength(2);
  for (const record of records) { expect(record.outgoingRelations).toEqual(expect.arrayContaining([expect.objectContaining({ sourceFieldId: f.relation, targetRecordId: f.c1 })])); expect(record.values).toEqual(expect.arrayContaining([expect.objectContaining({ entityFieldId: f.choice, textValue: "canonical-one" })])); }
 });
 it("current/latest read relation labels and preserve Person relation separately", async () => {
  const r = await getAttendanceWorkflowDay({ appViewId: f.view, contractId: f.contract, userId: f.user, date: f.day, personRecordId: f.p1 }); if (!r.ok) throw Error("Read rejected");
  expect(r.data.items[0]).toMatchObject({ person: { id: f.p1 }, attendance: { contextValues: { [f.relation]: { id: f.c1, displayName: "Catalog one" }, [f.choice]: { optionId: f.one, label: "One" } } } });
  expect(r.data.latest).toHaveLength(2); for (const row of r.data.latest) expect(row).toMatchObject({ contextValues: { [f.relation]: { id: f.c1, displayName: "Catalog one" } } });
  expect((await current()).extraValues?.[f.relation]).toEqual({ id: f.c1, displayName: "Catalog one" });
 });
 it("the actual Client write path edits one existing row, retains relation and replays once", async () => {
  const base = await current(); const body = request("edit", f.p1, f.c2, { overwrite: true, expectedUpdatedAt: base.updatedAt, states: { [f.status]: f.b } });
  const first = result(await save(body)); expect(first).toMatchObject({ result: "UPDATED", recordId: base.recordId }); expect(result(await save(body))).toEqual(first);
  const restored = await current(); expect(restored.recordId).toBe(base.recordId); expect(restored.extraValues?.[f.relation]).toEqual({ id: f.c2, displayName: "Catalog two" }); expect(await prisma.entityRecord.count({ where: { entityTypeId: f.target } })).toBe(2);
  expect(await prisma.auditEvent.count({ where: { contractId: f.contract } })).toBeGreaterThan(0);
  expect(result(await save(request("stale", f.p1, f.c1, { overwrite: true, expectedUpdatedAt: base.updatedAt })))).toMatchObject({ result: "CONFLICT", existing: { recordId: base.recordId, extraValues: { [f.relation]: { id: f.c2 } } } });
 });
 it("rejects missing/foreign/wrong-entity targets and unauthorized writes without mutation", async () => {
  const before = await current(), auditCount = await prisma.auditEvent.count({ where: { contractId: f.contract } });
  for (const [key, target] of [["empty", null], ["foreign", f.foreignRecord], ["wrong", f.p1]] as const) {
   const r = await save(request(key, f.p1, target, { overwrite: true, expectedUpdatedAt: before.updatedAt }));
   expect(r.ok && r.data.result.result === "ERROR" || !r.ok).toBe(true);
   expect(await current()).toEqual(before);
  }
  expect((await save(request("denied"), f.denied)).ok).toBe(false); expect(await current()).toEqual(before);
  expect(await prisma.auditEvent.count({ where: { contractId: f.contract } })).toBe(auditCount);
 });
});
