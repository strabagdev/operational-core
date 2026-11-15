import { describe, expect, it } from "vitest";
import { genericReuseEnabled, genericReuseKinds, selectiveReuseEnabled } from "./offline-selective-reuse";

describe("independent coverage reuse policy", () => {
  it("is disabled by default and never broadens the existing Attendance gate", () => {
    expect(genericReuseEnabled({})).toBe(false);
    expect(genericReuseEnabled({OPCO_OFFLINE_GENERIC_REUSE_POLICY:"true"})).toBe(false);
    const env={OPCO_OFFLINE_GENERIC_REUSE_POLICY:"verified-coverage-runtime-v1"};
    expect(genericReuseEnabled(env)).toBe(true);
    expect(selectiveReuseEnabled("any-contract",env)).toBe(false);
  });
  it.each(["RECORDS","PANEL","REPORT"])("uses configurable renderer categories: %s", type => {
    expect(genericReuseKinds(type,null)).toContain("metadata-only");
    expect(genericReuseKinds(type,null)).not.toContain("attendance-month");
  });
  it("offers no unknown renderer/workflow or implicit monthly Attendance grant", () => {
    expect(genericReuseKinds("WORKFLOW","attendance")).toEqual(["field-options-and-direct-catalogs"]);
    expect(genericReuseKinds("WORKFLOW","state-update")).toContain("state-update-current");
    expect(genericReuseKinds("WORKFLOW","unknown")).toEqual([]);
    expect(genericReuseKinds("BOARD",null)).toEqual([]);
  });
});
