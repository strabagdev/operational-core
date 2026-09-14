import { describe, expect, it } from "vitest";

import { normalizeUniqueFieldValue } from "./entity-records";

function field(type: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "field_1",
    name: "Campo",
    options: [],
    type,
    ...overrides,
  } as never;
}

describe("unique field normalization", () => {
  it("matches write normalization for text, numbers, booleans and temporal values", () => {
    expect(normalizeUniqueFieldValue(field("TEXT"), " EQ-001 ")).toMatchObject({ textValue: "EQ-001" });
    expect(normalizeUniqueFieldValue(field("INTEGER"), "001")).toMatchObject({ integerValue: 1 });
    expect(String(normalizeUniqueFieldValue(field("DECIMAL"), "001.2300").decimalValue)).toBe("1.23");
    expect(String(normalizeUniqueFieldValue(field("MONEY"), "000.00").decimalValue)).toBe("0");
    expect(normalizeUniqueFieldValue(field("BOOLEAN"), "false")).toMatchObject({ booleanValue: false });
    expect(normalizeUniqueFieldValue(field("BOOLEAN"), "true")).toMatchObject({ booleanValue: true });
    expect(normalizeUniqueFieldValue(field("DATE"), "2026-09-14").dateValue?.toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(normalizeUniqueFieldValue(field("DATETIME"), "2026-09-14T12:00:00-03:00").dateValue?.toISOString()).toBe("2026-09-14T15:00:00.000Z");
    expect(normalizeUniqueFieldValue(field("TIME"), "08:30")).toMatchObject({ textValue: "08:30" });
  });

  it("uses option values for select fields and treats empty values as empty", () => {
    const options = [
      { id: "option_1", isActive: true, label: "Activo", sortOrder: 1, value: "activo" },
      { id: "option_2", isActive: true, label: "Inactivo", sortOrder: 2, value: "inactivo" },
    ];

    expect(normalizeUniqueFieldValue(field("SELECT", { options }), "activo")).toMatchObject({ textValue: "activo" });
    expect(normalizeUniqueFieldValue(field("MULTISELECT", { options }), ["activo", "inactivo", "activo"]).jsonValue).toEqual([
      "activo",
      "inactivo",
    ]);
    expect(normalizeUniqueFieldValue(field("TEXT"), "   ")).toMatchObject({ textValue: null });
  });
});
