import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "./prisma";
import { createEntityRecord } from "./entity-records";
import { createAppView, updateAppView, getAppViewInput } from "./app-views";
import { getAttendanceWorkflowDay, saveAttendanceWorkflowDay } from "./attendance-workflow";
import { attendanceStateUpdateConfig, getStateUpdateContextForConfig, saveStateUpdateEntry, saveStateUpdateWorkflow } from "./state-update-workflow";
const suite = process.env.ATTENDANCE_REPETITION_PG === "1" ? describe.sequential : describe.skip;
const prefix = "write_identity_" + randomUUID().replaceAll("-", "").slice(0, 12);
const id = (key: string) => prefix + "_" + key;
const f = Object.fromEntries(["org", "user", "denied", "contract", "source", "target", "catalog", "subject", "date", "status", "choice", "relation", "observation", "a", "b", "c", "one", "lot1", "lot2", "app"].map(key => [key, id(key)]));
const people = Array.from({ length: 12 }, (_, i) => id("person" + i));
const day = "2026-11-03";
let view = "", otherView = "", validated = false;
const config = () => ({ sourceEntityTypeId: f.source, targetEntityTypeId: f.target, personFieldId: f.subject, dateFieldId: f.date, statusFieldId: f.status, defaultCheckInOptionId: f.a, contextFieldIds: [f.choice, f.relation], observationFieldId: f.observation });
const body = (key: string, person = people[0], change: Record<string, unknown> = {}) => ({ clientRequestId: id(key), subjectRecordId: person, date: day, states: { [f.status]: f.a }, extraValues: { [f.choice]: "one", [f.relation]: f.lot1, [f.observation]: "Synthetic observation" }, ...change });
const save = (command: Record<string, unknown>, appViewId = view, userId = f.user) => saveStateUpdateWorkflow({ appId: f.app, appViewId, contractId: f.contract, userId, body: command });
function result(response: Awaited<ReturnType<typeof save>>) {
    if (!response.ok)
        throw Error("Synthetic request rejected");
    return response.data.result;
}
async function rows(person: string, date = day) { return prisma.entityRecord.findMany({ where: { entityTypeId: f.target, outgoingRelations: { some: { sourceFieldId: f.subject, targetRecordId: person } }, values: { some: { entityFieldId: f.date, dateValue: new Date(date + "T00:00:00Z") } } }, include: { outgoingRelations: true, values: true } }); }
suite("Attendance repetition on isolated PostgreSQL", () => {
    beforeAll(async () => {
        const url = new URL(process.env.DATABASE_URL ?? "");
        if (url.hostname !== "127.0.0.1" || url.port !== "25432" || url.pathname !== "/repetition_test" || decodeURIComponent(url.username) !== "repetition_owner")
            throw Error("LOCAL_DATABASE_REQUIRED");
        const [connection] = await prisma.$queryRaw<Array<{
            database: string;
            role: string;
            address: string;
        }>> `SELECT current_database() AS database,current_user AS role,inet_server_addr()::text AS address`;
        expect(connection).toEqual({ database: "repetition_test", role: "repetition_owner", address: "127.0.0.1/32" });
        validated = true;
        await prisma.organization.create({ data: { id: f.org, name: "Synthetic write identity", slug: f.org } });
        for (const user of [f.user, f.denied]) {
            await prisma.user.create({ data: { id: user, email: user + "@example.invalid", passwordHash: "no-login-synthetic" } });
            await prisma.membership.create({ data: { userId: user, organizationId: f.org, role: user === f.user ? "ADMIN" : "MEMBER" } });
        }
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
        ])
            await prisma.entityField.create({ data: { ...field, name: field.key, entityTypeId: f.target } });
        await prisma.fieldOption.createMany({ data: [{ id: f.a, entityFieldId: f.status, label: "A", value: "a" }, { id: f.b, entityFieldId: f.status, label: "B", value: "b" }, { id: f.c, entityFieldId: f.status, label: "C", value: "c" }, { id: f.one, entityFieldId: f.choice, label: "One", value: "one" }] });
        await prisma.entityRecord.createMany({ data: [...people.map(person => ({ id: person, entityTypeId: f.source, displayName: "Synthetic subject" })), ...[f.lot1, f.lot2].map(lot => ({ id: lot, entityTypeId: f.catalog, displayName: "Synthetic catalog" }))] });
        for (const key of ["view", "other_view"]) {
            const form = new FormData();
            for (const [k, value] of Object.entries({ ...config(), type: "WORKFLOW", workflowKey: "attendance", name: id(key), slug: id(key).replaceAll("_", "-"), active: "on" }))
                if (typeof value === "string")
                    form.set(k, value);
            for (const field of config().contextFieldIds)
                form.append("contextFieldIds", field);
            const appView = await createAppView(f.contract, f.user, getAppViewInput(form));
            if (!appView)
                throw Error("Synthetic view rejected");
            await prisma.userAppViewAccess.create({ data: { appViewId: appView.id, userId: f.user, contractId: f.contract } });
            if (key === "view")
                view = appView.id;
            else
                otherView = appView.id;
        }
    });
    afterAll(async () => {
        vi.restoreAllMocks();
        if (validated) {
            await prisma.apiIdempotencyKey.deleteMany({ where: { contractId: f.contract } });
            await prisma.auditEvent.deleteMany({ where: { contractId: f.contract } });
            await prisma.entityRelation.deleteMany({ where: { sourceRecord: { entityType: { contractId: f.contract } } } });
            await prisma.organization.deleteMany({ where: { id: f.org } });
            await prisma.user.deleteMany({ where: { id: { in: [f.user, f.denied] } } });
        }
        await prisma.$disconnect();
    });
    async function policy(value: string) { await prisma.appView.updateMany({ where: { id: { in: [view, otherView] } }, data: { config: { ...config(), workflowKey: "attendance", repetitionPolicy: value } } }); }
    const multi = (key: string, person = people[1], extra: Record<string, unknown> = {}) => body(key, person, { repetitionPolicy: "MULTIPLE", ...extra });
    it("preserves atomic single-per-day without a configured policy", async () => {
        const r = await Promise.all([save(body("single1")), save(body("single2"))]);
        expect(r.map(x => result(x).result).sort()).toEqual(["CREATED", "UNCHANGED"]);
        expect(await rows(people[0])).toHaveLength(1);
        expect(result(await save(body("single-change", people[0], { states: { [f.status]: f.b } }))).result).toBe("CONFLICT");
    });
    it("keeps idempotency identical when ONE_PER_DAY is made explicit on a legacy command", async () => {
        await policy("ONE_PER_DAY");
        const command=body("one-explicit-compatibility",people[0]);
        const original=result(await save(command));
        expect(result(await save({...command,repetitionPolicy:"ONE_PER_DAY"}))).toEqual(original);
        expect(await rows(people[0])).toHaveLength(1);
    });
    it("creates independent records for distinct intentional commands and replays one key", async () => {
        await policy("MULTIPLE");
        const a = multi("multi1"), b = multi("multi2");
        const first = result(await save(a)), second = result(await save(b));
        expect(first.result).toBe("CREATED");
        expect(second.result).toBe("CREATED");
        expect(first).not.toMatchObject({ recordId: (second as {
                recordId: string;
            }).recordId });
        expect(result(await save(a))).toEqual(first);
        expect(await rows(people[1])).toHaveLength(2);
    });
    it("preserves all relations with concurrent additional captures and concurrent replays", async () => {
        const commands = Array.from({ length: 4 }, (_, i) => multi("parallel" + i, people[2]));
        const r = await Promise.all(commands.map(c => save(c)));
        expect(r.map(x => result(x).result)).toEqual(["CREATED", "CREATED", "CREATED", "CREATED"]);
        const same = multi("replay-concurrent", people[2]);
        const replay = await Promise.all([save(same), save(same)]);
        expect(result(replay[0])).toEqual(result(replay[1]));
        const records = await rows(people[2]);
        expect(records).toHaveLength(5);
        for (const row of records)
            expect(row.outgoingRelations).toEqual(expect.arrayContaining([expect.objectContaining({ sourceFieldId: f.relation, targetRecordId: f.lot1 })]));
    });
    it("updates only the selected older record and rejects a stale edit", async () => {
        const older = result(await save(multi("edit-old", people[3]))), newer = result(await save(multi("edit-new", people[3])));
        if (!("recordId" in older) || !("recordId" in newer))
            throw Error("Missing IDs");
        const before = (await rows(people[3])).find(r => r.id === newer.recordId);
        const edit = multi("edit-command", people[3], { targetRecordId: older.recordId, overwrite: true, expectedUpdatedAt: older.updatedAt, states: { [f.status]: f.b }, extraValues: { [f.choice]: "one", [f.relation]: f.lot2 } });
        expect(result(await save(edit))).toMatchObject({ result: "UPDATED", recordId: older.recordId });
        expect((await rows(people[3])).find(r => r.id === newer.recordId)).toEqual(before);
        expect(result(await save({ ...edit, clientRequestId: id("stale-edit") }))).toMatchObject({ result: "CONFLICT", conflictReason: "EXPECTED_UPDATED_AT_MISMATCH" });
        expect(await rows(people[3])).toHaveLength(2);
    });
    it("never creates instead of editing an unavailable or mismatched record", async () => {
        const missing = await save(multi("edit-missing", people[4], { targetRecordId: id("missing"), overwrite: true, expectedUpdatedAt: new Date().toISOString() }));
        expect(result(missing)).toMatchObject({ result: "ERROR", code: "ATTENDANCE_RECORD_UNAVAILABLE" });
        expect(await rows(people[4])).toHaveLength(0);
        const wrong = result(await save(multi("wrong-owner-base", people[4])));
        if (!("recordId" in wrong))
            throw Error("Missing record");
        expect(result(await save(multi("wrong-owner-edit", people[5], { targetRecordId: wrong.recordId, overwrite: true, expectedUpdatedAt: wrong.updatedAt })))).toMatchObject({ result: "ERROR", code: "ATTENDANCE_RECORD_UNAVAILABLE" });
        expect(await rows(people[5])).toHaveLength(0);
    });
    it("serializes warning checks with creation so two unacknowledged commands cannot bypass it", async () => {
        await policy("MULTIPLE_WITH_WARNING");
        const cmd = (key: string, ack = false) => multi(key, people[6], { repetitionPolicy: "MULTIPLE_WITH_WARNING", ...(ack ? { repetitionAcknowledged: true } : {}) });
        const r = await Promise.all([save(cmd("warn-race-a")), save(cmd("warn-race-b"))]);
        expect(r.map(x => result(x).result).sort()).toEqual(["CREATED", "ERROR"]);
        expect(r.map(x => result(x))).toEqual(expect.arrayContaining([expect.objectContaining({ code: "ATTENDANCE_REPEAT_CONFIRMATION_REQUIRED" })]));
        expect(result(await save(cmd("warn-ack", true))).result).toBe("CREATED");
        expect(result(await save(cmd("warn-ack", true))).result).toBe("CREATED");
        expect(await rows(people[6])).toHaveLength(2);
        const read = await getAttendanceWorkflowDay({ appViewId: view, contractId: f.contract, userId: f.user, date: day, personRecordId: people[6] });
        expect(read.ok).toBe(true);
        if (read.ok) {
            expect(read.data.items[0].dailyRecordCount).toBe(2);
            expect(read.data.dailyRecords).toHaveLength(2);
        }
    });
    it("rejects old clients, missing idempotency and changed policy before any record mutation", async () => {
        const count = await prisma.entityRecord.count({ where: { entityTypeId: f.target } });
        for (const c of [body("old", people[7]), multi("no-key", people[7], { clientRequestId: undefined }), multi("wrong-policy", people[7])]) {
            const r = await save(c);
            expect(r.ok).toBe(false);
            if (!r.ok)
                expect((await r.response.json()).error.code).toBe("ATTENDANCE_POLICY_CHANGED");
        }
        const oldEndpoint = await saveAttendanceWorkflowDay({ appId: f.app, appViewId: view, contractId: f.contract, userId: f.user, body: { date: day, clientRequestId: id("legacy"), entries: [{ personRecordId: people[7], statusOptionId: f.a }] } });
        expect(oldEndpoint.ok).toBe(false);
        expect(await prisma.entityRecord.count({ where: { entityTypeId: f.target } })).toBe(count);
    });
    it("rejects incompatible active writers for the same physical identity", async () => {
        await policy("MULTIPLE");
        await prisma.appView.update({ where: { id: otherView }, data: { config: { ...config(), workflowKey: "attendance" } } });
        expect(result(await save(multi("incompatible-writers", people[9])))).toMatchObject({ result: "ERROR", code: "ATTENDANCE_WRITERS_INCOMPATIBLE" });
        expect(await rows(people[9])).toHaveLength(0);
        await policy("MULTIPLE");
    });
    it("preserves the default writer alongside a preexisting generic append experience", async () => {
        await policy("ONE_PER_DAY");
        await prisma.appView.update({where:{id:otherView},data:{config:{workflowKey:"state-update",sourceEntityTypeId:f.source,targetEntityTypeId:f.target,subjectFieldId:f.subject,dateFieldId:f.date,stateFields:[{fieldId:f.status}],historyMode:"append",uniqueness:{mode:"subject-date"}}}});
        expect(result(await save(body("legacy-generic-coexist",people[9]))).result).toBe("CREATED");
        expect(result(await save(body("legacy-generic-coexist-repeat",people[9]))).result).toBe("UNCHANGED");
        expect(await rows(people[9])).toHaveLength(1);
        await policy("MULTIPLE");
    });
    it("keeps offline event time in creation audit and protects it with the immutable request hash", async () => {
        await policy("MULTIPLE");
        const command = multi("captured-time", people[10], { eventOccurredAt: "2026-11-16T02:30:00.000Z" });
        const first = result(await save(command));
        if (!("recordId" in first))
            throw Error("Missing record");
        const audit = await prisma.auditEvent.findFirst({ where: { entityRecordId: first.recordId, action: "RECORD_CREATED" } });
        expect(audit?.metadata).toMatchObject({ eventOccurredAt: "2026-11-16T02:30:00.000Z" });
        const read = await getAttendanceWorkflowDay({ appViewId: view, contractId: f.contract, userId: f.user, date: day, personRecordId: people[10] });
        expect(read.ok).toBe(true);
        if (read.ok)
            expect(read.data.dailyRecords?.[0].attendance).toMatchObject({ eventOccurredAt: "2026-11-16T02:30:00.000Z" });
        expect(result(await save(command))).toEqual(first);
        const changed = await save({ ...command, eventOccurredAt: "2026-11-16T02:31:00.000Z" });
        expect(changed.ok).toBe(false);
        if (!changed.ok)
            expect((await changed.response.json()).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    });
    it("does not downgrade a multi-record history by silently changing or collapsing records", async () => {
        await policy("MULTIPLE");
        await prisma.appView.update({ where: { id: otherView }, data: { active: false } });
        const form = new FormData();
        for (const [key, value] of Object.entries({ ...config(), type: "WORKFLOW", workflowKey: "attendance", name: "Synthetic", slug: "synthetic-downgrade", active: "on", repetitionPolicy: "ONE_PER_DAY" }))
            if (typeof value === "string")
                form.set(key, value);
        for (const id of config().contextFieldIds)
            form.append("contextFieldIds", id);
        const before = await rows(people[1]);
        await expect(updateAppView(f.contract, view, f.user, getAppViewInput(form))).rejects.toThrow("varios registros");
        expect(await rows(people[1])).toEqual(before);
        expect((await prisma.appView.findUnique({ where: { id: view } }))?.config).toMatchObject({ repetitionPolicy: "MULTIPLE" });
        await prisma.appView.update({ where: { id: otherView }, data: { active: true } });
    });
    it("retains legacy Attendance config aliases with no repetition property", async () => {
        await policy("ONE_PER_DAY");
        await prisma.appView.update({ where: { id: view }, data: { config: { ...config(), workflow: "attendance" } } });
        expect(result(await save(body("legacy-alias", people[11]))).result).toBe("CREATED");
        expect(result(await save(body("legacy-alias-repeat", people[11]))).result).toBe("UNCHANGED");
        await policy("MULTIPLE");
    });
    it("rejects a captured context whose policy changed before acquiring the write lock", async () => {
        await policy("MULTIPLE");
        const prepared = await getStateUpdateContextForConfig({ appView: { id: view, name: "Synthetic", slug: "synthetic" }, config: attendanceStateUpdateConfig({ ...config(), repetitionPolicy: "MULTIPLE" }), contractId: f.contract });
        if (!prepared.ok)
            throw Error("Context rejected");
        await policy("MULTIPLE_WITH_WARNING");
        const saved = await saveStateUpdateEntry({ appId: f.app, context: prepared.context, contractId: f.contract, idempotencyKey: null, input: { clientRequestId: id("stale-policy"), repetitionPolicy: "MULTIPLE", date: new Date(day + "T00:00:00Z"), dateValue: day, subjectRecordId: people[7], states: { [f.status]: f.a }, extraValues: { [f.choice]: "one", [f.relation]: f.lot1 }, overwrite: false }, userId: f.user });
        expect(saved.result).toMatchObject({ result: "ERROR", code: "ATTENDANCE_POLICY_CHANGED" });
        expect(await rows(people[7])).toHaveLength(0);
        await policy("MULTIPLE");
    });
    it("keeps workflow authorization, mandatory contexts and audit/idempotency guards", async () => {
        await policy("MULTIPLE");
        expect((await save(multi("denied", people[8]), view, f.denied)).ok).toBe(false);
        const missing = await save(multi("context-missing", people[8], { extraValues: { [f.choice]: "one" } }));
        expect(missing.ok).toBe(false);
        expect(await rows(people[8])).toHaveLength(0);
        await prisma.appView.update({ where: { id: view }, data: { config: { ...config(), workflowKey: "attendance", repetitionPolicy: "MULTIPLE", workflowWritePolicy: { version: 1, mode: "workflow-only", acceptNewCommands: true, allowedAppViewIds: [view] } } } });
        const read = await getAttendanceWorkflowDay({ appViewId: view, contractId: f.contract, userId: f.user, date: day, personRecordId: people[8] });
        if (!read.ok)
            throw Error("Read denied");
        const command = multi("protected", people[8], { writeCommand: { version: 1, configurationFingerprint: read.data.workflowWriteContract!.configurationFingerprint, capabilities: ["relation-context-v1"] } });
        expect(result(await save(command)).result).toBe("CREATED");
        expect(result(await save(command)).result).toBe("CREATED");
        expect(await rows(people[8])).toHaveLength(1);
        const form = new FormData();
        await expect(createEntityRecord(f.contract, f.target, f.user, form)).rejects.toThrow();
    });
});
