import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("remove EntityRecord status migration", () => {
  it("preserves rows and only removes the technical status schema", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "prisma/migrations/20260810171000_remove_entity_record_status/migration.sql",
      ),
      "utf8",
    );

    expect(sql).toContain('DROP COLUMN IF EXISTS "status"');
    expect(sql).toContain('DROP TYPE IF EXISTS "EntityRecordStatus"');
    expect(sql).not.toMatch(/\bDELETE\b/i);
    expect(sql).not.toContain("ContractStatus");
    expect(sql).not.toContain('"Contract"');
  });
});
