import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import { deserializeEntityValue } from "./entity-records";

describe("entity record display values", () => {
  it("uses SELECT labels from inactive historical options", () => {
    expect(
      deserializeEntityValue({
        textValue: "retirado",
        integerValue: null,
        decimalValue: null,
        booleanValue: null,
        dateValue: null,
        jsonValue: null,
        entityField: {
          type: "SELECT",
          options: [{ label: "Retirado", value: "retirado" }],
        },
      }),
    ).toBe("Retirado");
  });

  it("uses MULTISELECT labels for values stored in the JSON array", () => {
    expect(
      deserializeEntityValue({
        textValue: null,
        integerValue: null,
        decimalValue: null,
        booleanValue: null,
        dateValue: null,
        jsonValue: ["operativo", "retirado"],
        entityField: {
          type: "MULTISELECT",
          options: [
            { label: "Operativo", value: "operativo" },
            { label: "Retirado", value: "retirado" },
          ],
        },
      }),
    ).toBe("Operativo, Retirado");
  });

  it("formats DATE fields as date-only values without timezone drift", () => {
    expect(
      deserializeEntityValue({
        textValue: null,
        integerValue: null,
        decimalValue: null,
        booleanValue: null,
        dateValue: new Date("2026-01-21T00:00:00.000Z"),
        jsonValue: null,
        entityField: {
          type: "DATE",
          options: [],
        },
      }),
    ).toBe("21-01-2026");
  });

  it("keeps DATETIME values on the existing locale formatter", () => {
    const dateValue = new Date("2026-01-21T00:00:00.000Z");

    expect(
      deserializeEntityValue({
        textValue: null,
        integerValue: null,
        decimalValue: null,
        booleanValue: null,
        dateValue,
        jsonValue: null,
        entityField: {
          type: "DATETIME",
          options: [],
        },
      }),
    ).toBe(dateValue.toLocaleDateString("es-CL"));
  });

  it("formats MONEY values with the field currency config", () => {
    expect(
      deserializeEntityValue({
        textValue: null,
        integerValue: null,
        decimalValue: new Prisma.Decimal("5269808713"),
        booleanValue: null,
        dateValue: null,
        jsonValue: null,
        entityField: {
          type: "MONEY",
          config: { money: { currency: "CLP" } },
          options: [],
        },
      }),
    ).toBe("$5.269.808.713");
  });

  it("formats MONEY values as CLP when config is missing", () => {
    expect(
      deserializeEntityValue({
        textValue: null,
        integerValue: null,
        decimalValue: new Prisma.Decimal("5269808713"),
        booleanValue: null,
        dateValue: null,
        jsonValue: null,
        entityField: {
          type: "MONEY",
          options: [],
        },
      }),
    ).toBe("$5.269.808.713");
  });
});
