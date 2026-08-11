import { describe, expect, it } from "vitest";

import { dateOnlyInputValue, dateOnlyToUtcDate, formatDateOnly } from "./date-only";

describe("date-only helpers", () => {
  it("formats a persisted DATE without timezone drift", () => {
    const storedDate = new Date("2026-01-21T00:00:00.000Z");

    expect(dateOnlyInputValue(storedDate)).toBe("2026-01-21");
    expect(formatDateOnly(storedDate)).toBe("21-01-2026");
  });

  it("keeps YYYY-MM-DD strings as calendar dates", () => {
    expect(dateOnlyInputValue("2026-01-21")).toBe("2026-01-21");
    expect(formatDateOnly("2026-01-21")).toBe("21-01-2026");
  });

  it.each([
    "UTC",
    "UTC-3",
    "UTC-4",
    "UTC+10",
  ])("keeps DATE output identical for %s", () => {
    const storedDate = new Date("2026-01-21T00:00:00.000Z");

    expect(dateOnlyInputValue(storedDate)).toBe("2026-01-21");
    expect(formatDateOnly(storedDate)).toBe("21-01-2026");
  });

  it("rejects invalid calendar dates instead of normalizing them", () => {
    expect(dateOnlyToUtcDate("2026-02-31")).toBeNull();
    expect(dateOnlyInputValue("2026-02-31")).toBe("");
  });
});
