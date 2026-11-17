import { describe, it, expect } from "vitest";
import { parseAppViewConfig, getAppViewInput } from "./app-views";
import { attendanceStateUpdateConfig } from "./state-update-workflow";
const config = { workflowKey: "attendance", sourceEntityTypeId: "source", targetEntityTypeId: "target", personFieldId: "person", dateFieldId: "date", statusFieldId: "status", defaultCheckInOptionId: "a" } as const;
describe("Attendance policy configuration compatibility", () => {
    it("keeps the absent policy and original subject-date update-current adapter", () => {
        const parsed = parseAppViewConfig({ type: "WORKFLOW", config });
        expect(parsed).not.toHaveProperty("repetitionPolicy");
        expect(attendanceStateUpdateConfig({ ...config })).toMatchObject({ uniqueness: { mode: "subject-date" }, historyMode: "update-current" });
    });
    it.each(["ONE_PER_DAY", "MULTIPLE_WITH_WARNING", "MULTIPLE"] as const)("round trips %s through editor FormData and parsing", policy => {
        const f = new FormData();
        for (const [k, v] of Object.entries({ ...config, type: "WORKFLOW", name: "Synthetic", slug: "synthetic", active: "on", repetitionPolicy: policy }))
            f.set(k, v);
        expect(getAppViewInput(f).rawConfig.repetitionPolicy).toBe(policy);
        const parsed = parseAppViewConfig({ type: "WORKFLOW", config: { ...config, repetitionPolicy: policy } });
        expect(parsed).toHaveProperty("repetitionPolicy", policy);
        expect(attendanceStateUpdateConfig({ ...config, repetitionPolicy: policy }).historyMode).toBe(policy === "ONE_PER_DAY" ? "update-current" : "append");
    });
    it("rejects unknown policies instead of treating them as permission to repeat", () => { expect(() => parseAppViewConfig({ type: "WORKFLOW", config: { ...config, repetitionPolicy: "anything" } })).toThrow(); });
});
