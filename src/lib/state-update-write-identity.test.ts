import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StateUpdateContext, StateUpdateInput } from "./state-update-workflow";
import { stateUpdateWriteIdentityKey, withStateUpdateWriteIdentity } from "./state-update-write-identity";
import { prisma } from "./prisma";

vi.mock("./prisma", () => ({ prisma: { $transaction: vi.fn() } }));
const context = (mode = "subject-date", historyMode = "update-current") => ({
  appView: { id: "view-one" }, targetEntityType: { id: "target" },
  config: { uniqueness: { mode }, historyMode, subjectFieldId: "subject", dateFieldId: "day" },
}) as StateUpdateContext;
const command = () => ({ subjectRecordId: "0001", date: new Date("2026-11-03T00:00:00Z"), dateValue: "2026-11-03", states: {}, extraValues: {}, overwrite: false }) as StateUpdateInput;

beforeEach(() => vi.clearAllMocks());
describe("declared legacy write identity", () => {
  it("shares identity across views, users/request keys and content, while isolating fields, scope, subject and date", () => {
    const c = context(), i = command(), key = stateUpdateWriteIdentityKey("contract", c, i);
    expect(stateUpdateWriteIdentityKey("contract", { ...c, appView: { ...c.appView, id: "other-view" } }, { ...i, clientRequestId: "other-request", states: { status: "b" }, extraValues: { context: "other" }, overwrite: true })).toBe(key);
    for (const [contract, ctx, input] of [
      ["other-contract", c, i],
      ["contract", { ...c, targetEntityType: { ...c.targetEntityType, id: "other-target" } }, i],
      ["contract", { ...c, config: { ...c.config, subjectFieldId: "other-role" } }, i],
      ["contract", c, { ...i, subjectRecordId: "1" }],
      ["contract", c, { ...i, date: new Date("2026-11-04T00:00:00Z") }],
    ] as const) expect(stateUpdateWriteIdentityKey(contract, ctx, input)).not.toBe(key);
  });
  it("does not require or include a date for subject-only identity", () => {
    const c = context("subject"), i = command();
    expect(stateUpdateWriteIdentityKey("contract", c, { ...i, date: undefined })).toBe(stateUpdateWriteIdentityKey("contract", c, i));
  });
  it.each([["none", "update-current"], ["subject-date", "append"], ["subject-date-fields", "update-current"]])("preserves the existing path for %s/%s", async (mode, history) => {
    const c = context(mode, history), work = vi.fn(async () => "result");
    expect(stateUpdateWriteIdentityKey("contract", c, command())).toBeNull();
    expect(await withStateUpdateWriteIdentity(c, command(), "contract", work)).toBe("result");
    expect(work).toHaveBeenCalledWith(c); expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("does not silently weaken an incomplete subject-date identity", () => {
    expect(() => stateUpdateWriteIdentityKey("contract", context(), { ...command(), date: undefined })).toThrow("STATE_UPDATE_WRITE_IDENTITY_INCOMPLETE");
  });
  it("awaits the transaction lock before reading/mutating and propagates rollback failures", async () => {
    const order: string[] = [], transaction = { $queryRaw: vi.fn(async () => { order.push("lock"); return []; }) };
    vi.mocked(prisma.$transaction).mockImplementation(async callback => (callback as (tx: unknown) => Promise<unknown>)(transaction));
    await expect(withStateUpdateWriteIdentity(context(), command(), "contract", async scoped => { order.push("work"); expect(scoped.transaction).toBe(transaction); throw Error("rollback"); })).rejects.toThrow("rollback");
    expect(order).toEqual(["lock", "work"]); expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "ReadCommitted" });
    const [strings, key] = transaction.$queryRaw.mock.calls[0] as unknown as [TemplateStringsArray, string];
    expect(strings.join("?")).toContain("pg_advisory_xact_lock(hashtextextended(?, 0))"); expect(key).toBe(stateUpdateWriteIdentityKey("contract", context(), command()));
  });
  it("uses a caller transaction without nesting it", async () => {
    const tx = { $queryRaw: vi.fn(async () => []) }, c = { ...context(), transaction: tx as never };
    expect(await withStateUpdateWriteIdentity(c, command(), "contract", async scoped => scoped.transaction)).toBe(tx);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1); expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
