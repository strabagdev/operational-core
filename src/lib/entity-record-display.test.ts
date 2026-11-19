import { afterEach, describe, expect, it, vi } from "vitest";
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

  afterEach(() => vi.unstubAllEnvs());

  it.each(["UTC", "America/Santiago", "Pacific/Auckland"])(
    "shows DATETIME time and explicit UTC independently of server TZ=%s",
    (serverTimeZone) => {
      vi.stubEnv("TZ", serverTimeZone);
      const dateValue = new Date("2026-01-21T14:23:45.678Z");
      expect(deserializeEntityValue({
        textValue: null, integerValue: null, decimalValue: null,
        booleanValue: null, dateValue, jsonValue: null,
        entityField: { type: "DATETIME", options: [] },
      })).toBe("21-01-2026, 14:23:45 UTC");
      expect(dateValue.toISOString()).toBe("2026-01-21T14:23:45.678Z");
    },
  );

  it.each([
    ["2026-01-20T21:00:05.006-03:00", "21-01-2026, 00:00:05 UTC"],
    ["2026-12-31T23:59:59.999Z", "31-12-2026, 23:59:59 UTC"],
  ])("renders the UTC instant at day/year boundaries: %s", (instant, expected) => {
    expect(deserializeEntityValue({
      textValue: null, integerValue: null, decimalValue: null,
      booleanValue: null, dateValue: new Date(instant), jsonValue: null,
      entityField: { type: "DATETIME", options: [] },
    })).toBe(expected);
  });

  it("keeps DATE date-only under a non-UTC server timezone", () => {
    vi.stubEnv("TZ", "America/Los_Angeles");
    expect(deserializeEntityValue({
      textValue: null, integerValue: null, decimalValue: null,
      booleanValue: null, dateValue: new Date("2026-01-21T00:00:00.000Z"), jsonValue: null,
      entityField: { type: "DATE", options: [] },
    })).toBe("21-01-2026");
  });

  it("does not fabricate a DATETIME for an empty historical field", () => {
    expect(deserializeEntityValue({
      textValue: null, integerValue: null, decimalValue: null,
      booleanValue: null, dateValue: null, jsonValue: null,
      entityField: { type: "DATETIME", options: [] },
    })).toBe("");
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
