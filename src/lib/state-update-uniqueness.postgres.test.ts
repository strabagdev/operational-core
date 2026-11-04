import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "./prisma";
import { createEntityRecord } from "./entity-records";
import { fieldInputName } from "./field-validation";
import { createAppView, getAppViewInput } from "./app-views";
import { saveAttendanceWorkflowDay } from "./attendance-workflow";
import { attendanceStateUpdateConfig, getStateUpdateContextForConfig, saveStateUpdateEntry, saveStateUpdateWorkflow } from "./state-update-workflow";

const suite = process.env.STATE_UPDATE_UNIQUENESS_PG === "1" ? describe.sequential : describe.skip;
const prefix = "write_identity_" + randomUUID().replaceAll("-", "").slice(0, 12);
const id = (key: string) => prefix + "_" + key;
const f = Object.fromEntries(["org", "user", "denied", "contract", "source", "target", "catalog", "subject", "date", "status", "choice", "relation", "observation", "a", "b", "c", "one", "lot1", "lot2", "app"].map(key => [key, id(key)]));
const people = Array.from({ length: 12 }, (_, i) => id("person" + i));
const day = "2026-11-03";
let view = "", otherView = "", validated = false;
const config = () => ({ sourceEntityTypeId: f.source, targetEntityTypeId: f.target, personFieldId: f.subject, dateFieldId: f.date, statusFieldId: f.status, defaultCheckInOptionId: f.a, contextFieldIds: [f.choice, f.relation], observationFieldId: f.observation });
const body = (key: string, person = people[0], change: Record<string, unknown> = {}) => ({ clientRequestId: id(key), subjectRecordId: person, date: day, states: { [f.status]: f.a }, extraValues: { [f.choice]: "one", [f.relation]: f.lot1, [f.observation]: "Synthetic observation" }, ...change });
const save = (command: ReturnType<typeof body>, appViewId = view, userId = f.user) => saveStateUpdateWorkflow({ appId: f.app, appViewId, contractId: f.contract, userId, body: command });
function result(response: Awaited<ReturnType<typeof save>>) { if (!response.ok) throw Error("Synthetic request rejected"); return response.data.result; }
async function rows(person: string, date = day) { return prisma.entityRecord.findMany({ where: { entityTypeId: f.target, outgoingRelations: { some: { sourceFieldId: f.subject, targetRecordId: person } }, values: { some: { entityFieldId: f.date, dateValue: new Date(date + "T00:00:00Z") } } }, include: { outgoingRelations: true, values: true } }); }

suite("legacy write identity on validated local PostgreSQL", () => {
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
   { id: f.relation, key: "relation", type: "RELATION" as const, required: true, config: { targetEntityTypeId: f.catalog, relationKind: "ONE" } },
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
  if (validated) { await prisma.apiIdempotencyKey.deleteMany({ where: { contractId: f.contract } }); await prisma.auditEvent.deleteMany({ where: { contractId: f.contract } }); await prisma.entityRelation.deleteMany({ where: { sourceRecord: { entityType: { contractId: f.contract } } } }); await prisma.organization.deleteMany({ where: { id: f.org } }); await prisma.user.deleteMany({ where: { id: { in: [f.user, f.denied] } } }); }
  await prisma.$disconnect();
 });
 it("serializes independent identical commands across AppViews, with one row and one creation audit", async () => {
  // Retain real PostgreSQL results briefly to widen the demonstrated old lookup/create race.
  // The corrected path uses its transaction client instead of this root delegate.
  const original = prisma.entityRecord.findMany.bind(prisma.entityRecord);
  const spy = vi.spyOn(prisma.entityRecord, "findMany").mockImplementation((async (args: Parameters<typeof original>[0]) => {
   const found = await original(args);
   if (args?.where?.entityTypeId === f.target && args?.where?.outgoingRelations) await new Promise(resolve => setTimeout(resolve, 100));
   return found;
  }) as typeof original);
  let results;
  try { results = await Promise.all(Array.from({ length: 4 }, (_, i) => save(body("parallel_" + i), i % 2 ? otherView : view))); } finally { spy.mockRestore(); }
  const statuses = results.map(r => result(r).result).sort();
  expect(await rows(people[0])).toHaveLength(1);
  expect(statuses).toEqual(["CREATED", "UNCHANGED", "UNCHANGED", "UNCHANGED"]);
  const [record] = await rows(people[0]);
  expect(record.outgoingRelations).toEqual(expect.arrayContaining([expect.objectContaining({ sourceFieldId: f.relation, targetRecordId: f.lot1 })]));
  expect(record.values).toEqual(expect.arrayContaining([expect.objectContaining({ entityFieldId: f.choice, textValue: "one" })]));
  expect(await prisma.auditEvent.count({ where: { entityRecordId: record.id, action: "RECORD_CREATED" } })).toBe(1);
  for (let i = 0; i < results.length; i++) expect(result(await save(body("parallel_" + i), i % 2 ? otherView : view))).toEqual(result(results[i]));
 });
 it("concurrent distinct states create once and return a conflict without unauthorized overwrite", async () => {
  const results = await Promise.all([save(body("different_a", people[1])), save(body("different_b", people[1], { states: { [f.status]: f.b } }))]);
  expect(results.map(r => result(r).result).sort()).toEqual(["CONFLICT", "CREATED"]);
  expect(await rows(people[1])).toHaveLength(1);
 });
 it("serializes explicit corrections and validates the original base version", async () => {
  const created = result(await save(body("base", people[2]))); if (!("recordId" in created)) throw Error("No base");
  const commands = [body("overwrite_b", people[2], { overwrite: true, expectedUpdatedAt: created.updatedAt, states: { [f.status]: f.b } }), body("overwrite_c", people[2], { overwrite: true, expectedUpdatedAt: created.updatedAt, states: { [f.status]: f.c } })];
  const results = await Promise.all(commands.map(command => save(command)));
  expect(results.map(r => result(r).result).sort()).toEqual(["CONFLICT", "UPDATED"]);
  const conflict = results.map(r => result(r)).find(r => r.result === "CONFLICT"); expect(conflict).toMatchObject({ conflictReason: "EXPECTED_UPDATED_AT_MISMATCH" });
  expect(await rows(people[2])).toHaveLength(1);
  expect(await prisma.auditEvent.count({ where: { entityRecordId: created.recordId, action: "RECORD_UPDATED" } })).toBe(1);
 });
 it("shares the same lock between legacy Attendance and shared STATE_UPDATE endpoints", async () => {
  const legacy = saveAttendanceWorkflowDay({ appId: f.app, appViewId: view, contractId: f.contract, userId: f.user, body: { clientRequestId: id("legacy_parallel"), date: day, entries: [{ personRecordId: people[3], statusOptionId: f.a, contextValues: { [f.choice]: f.one, [f.relation]: f.lot1 }, observation: "Synthetic observation" }] } });
  const [legacyResult, generic] = await Promise.all([legacy, save(body("generic_parallel", people[3]))]);
  expect(legacyResult.ok).toBe(true); if (!legacyResult.ok) throw Error("Legacy rejected");
  expect([legacyResult.data.results[0].result, result(generic).result].sort()).toEqual(["CREATED", "UNCHANGED"]);
  expect(await rows(people[3])).toHaveLength(1);
 });
 it("keeps different people/dates independent and preserves sequential UNCHANGED", async () => {
  const commands = [body("person4", people[4]), body("person5", people[5]), body("day_other", people[4], { date: "2026-11-02" })];
  expect((await Promise.all(commands.map(command => save(command)))).map(r => result(r).result)).toEqual(["CREATED", "CREATED", "CREATED"]);
  expect(result(await save(body("same_sequential", people[4]))).result).toBe("UNCHANGED");
  expect(await rows(people[4])).toHaveLength(1); expect(await rows(people[4], "2026-11-02")).toHaveLength(1); expect(await rows(people[5])).toHaveLength(1);
 });
 it("does not mutate preexisting duplicate identities and persists the explicit rejection for replay", async () => {
  for (let i = 0; i < 2; i++) await prisma.entityRecord.create({ data: { entityTypeId: f.target, displayName: "Synthetic preexisting duplicate", outgoingRelations: { create: [{ sourceFieldId: f.subject, targetRecordId: people[6] }, { sourceFieldId: f.relation, targetRecordId: f.lot1 }] }, values: { create: [{ entityFieldId: f.date, dateValue: new Date(day + "T00:00:00Z") }, { entityFieldId: f.status, textValue: "a" }, { entityFieldId: f.choice, textValue: "one" }] } } });
  const before = await rows(people[6]), audits = await prisma.auditEvent.count({ where: { contractId: f.contract } });
  const command = body("duplicates_existing", people[6]); const rejected = result(await save(command));
  expect(rejected).toMatchObject({ result: "ERROR", code: "DUPLICATE_STATE_UPDATE_IDENTITY" });
  expect(result(await save(command))).toEqual(rejected); expect(await rows(people[6])).toEqual(before);
  expect(await prisma.auditEvent.count({ where: { contractId: f.contract } })).toBe(audits);
 });
 it("rollback releases the identity lock and leaves no partial content/audit or persistent slot", async () => {
  const prepared = await getStateUpdateContextForConfig({ appView: { id: view, name: "Synthetic", slug: "synthetic" }, config: attendanceStateUpdateConfig(config()), contractId: f.contract }); if (!prepared.ok) throw Error("Context rejected");
  const auditCount = await prisma.auditEvent.count({ where: { contractId: f.contract } });
  await expect(prisma.$transaction(async transaction => {
   await saveStateUpdateEntry({ appId: f.app, context: { ...prepared.context, transaction }, contractId: f.contract, idempotencyKey: null, input: { subjectRecordId: people[7], date: new Date(day + "T00:00:00Z"), dateValue: day, states: { [f.status]: f.a }, extraValues: { [f.choice]: "one", [f.relation]: f.lot1 }, overwrite: false }, userId: f.user });
   throw Error("SYNTHETIC_ROLLBACK");
  })).rejects.toThrow("SYNTHETIC_ROLLBACK");
  expect(await rows(people[7])).toHaveLength(0); expect(await prisma.auditEvent.count({ where: { contractId: f.contract } })).toBe(auditCount);
  expect(await prisma.stateUpdateIdentitySlot.count({ where: { definition: { targetEntityTypeId: f.target } } })).toBe(0);
  expect(result(await save(body("after_rollback", people[7]))).result).toBe("CREATED");
 });
 it("replays concurrent identical idempotency keys with one durable effect", async () => {
  const command = body("concurrent_replay", people[10]);
  const responses = await Promise.all([save(command), save(command)]);
  expect(result(responses[0])).toEqual(result(responses[1]));
  const records = await rows(people[10]); expect(records).toHaveLength(1);
  expect(await prisma.auditEvent.count({ where: { entityRecordId: records[0].id, action: "RECORD_CREATED" } })).toBe(1);
 });
 it("documents the unchanged generic-editor boundary instead of claiming a database-wide constraint", async () => {
  expect(result(await save(body("generic_boundary", people[9]))).result).toBe("CREATED");
  const form = new FormData();
  for (const [field, value] of Object.entries({ [f.subject]: people[9], [f.date]: day, [f.status]: "a", [f.choice]: "one", [f.relation]: f.lot1 })) form.set(fieldInputName(field), value);
  const record = await createEntityRecord(f.contract, f.target, f.user, form);
  expect(record).not.toBeNull(); expect(await rows(people[9])).toHaveLength(2);
  expect(result(await save(body("generic_boundary_guard", people[9])))).toMatchObject({ result: "ERROR", code: "DUPLICATE_STATE_UPDATE_IDENTITY" });
 });
 it("retains authorization and idempotency payload mismatch protections", async () => {
  expect((await save(body("denied", people[8]), view, f.denied)).ok).toBe(false); expect(await rows(people[8])).toHaveLength(0);
  const command = body("replay", people[8]); const first = result(await save(command)); expect(result(await save(command))).toEqual(first);
  const mismatch = await save({ ...command, states: { [f.status]: f.b } }); expect(mismatch.ok).toBe(false); if (!mismatch.ok) expect((await mismatch.response.json()).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  expect(await rows(people[8])).toHaveLength(1);
 });
});
