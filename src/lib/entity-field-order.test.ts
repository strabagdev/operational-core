import { describe, expect, it } from "vitest";

import {
  getReorderedEntityFieldUpdates,
  orderEntityFields,
  type OrderableEntityField,
} from "./entity-field-order";

function field(overrides: Partial<OrderableEntityField> = {}): OrderableEntityField {
  return {
    id: "field_1",
    sortOrder: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("entity field order", () => {
  it("orders by sortOrder and does not mutate the original array", () => {
    const fields = [
      field({ id: "cargo", sortOrder: 3 }),
      field({ id: "nombre", sortOrder: 1 }),
      field({ id: "rut", sortOrder: 2 }),
    ];

    expect(orderEntityFields(fields).map((item) => item.id)).toEqual([
      "nombre",
      "rut",
      "cargo",
    ]);
    expect(fields.map((item) => item.id)).toEqual(["cargo", "nombre", "rut"]);
  });

  it("uses createdAt and id as stable tie-breakers", () => {
    const fields = [
      field({ id: "c", sortOrder: 1, createdAt: new Date("2026-01-03T00:00:00.000Z") }),
      field({ id: "b", sortOrder: 1, createdAt: new Date("2026-01-02T00:00:00.000Z") }),
      field({ id: "a", sortOrder: 1, createdAt: new Date("2026-01-02T00:00:00.000Z") }),
    ];

    expect(orderEntityFields(fields).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("moves fields by the official order and normalizes duplicate sortOrder values", () => {
    const fields = [
      field({ id: "nombre", sortOrder: 1 }),
      field({ id: "rut", sortOrder: 1, createdAt: new Date("2026-01-02T00:00:00.000Z") }),
      field({ id: "cargo", sortOrder: 3 }),
    ];

    expect(getReorderedEntityFieldUpdates(fields, "rut", "down")).toEqual([
      { id: "cargo", sortOrder: 2 },
      { id: "rut", sortOrder: 3 },
    ]);
  });

  it("returns no updates when the requested move is outside the list", () => {
    expect(getReorderedEntityFieldUpdates([field({ id: "nombre" })], "nombre", "up")).toEqual([]);
    expect(getReorderedEntityFieldUpdates([field({ id: "nombre" })], "missing", "down")).toEqual([]);
  });
});
