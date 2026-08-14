import { describe, expect, it } from "vitest";

import {
  entityIconOptions,
  getEntityIconOption,
  isEntityIconKey,
  normalizeEntityIcon,
} from "./entity-icons";

describe("entity icon catalog", () => {
  it("contains only stable unique keys", () => {
    const keys = entityIconOptions.map((option) => option.key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining([
      "warehouse",
      "package",
      "users",
      "settings",
    ]));
  });

  it("accepts only catalog keys", () => {
    expect(isEntityIconKey("warehouse")).toBe(true);
    expect(isEntityIconKey("not-a-real-icon")).toBe(false);
    expect(normalizeEntityIcon(" warehouse ")).toBe("warehouse");
    expect(normalizeEntityIcon("")).toBeNull();
    expect(normalizeEntityIcon("not-a-real-icon")).toBeNull();
  });

  it("resolves icon metadata for valid keys only", () => {
    expect(getEntityIconOption("warehouse")).toMatchObject({
      key: "warehouse",
      label: "Bodega",
    });
    expect(getEntityIconOption(null)).toBeNull();
    expect(getEntityIconOption("free-text")).toBeNull();
  });
});
