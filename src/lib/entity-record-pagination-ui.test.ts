import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const recordsPageSource = readFileSync(
  new URL("../app/app/contracts/[contractId]/records/[entityTypeId]/page.tsx", import.meta.url),
  "utf8",
);

describe("entity record pagination UI", () => {
  it("offers the supported page sizes in the listing filter form", () => {
    expect(recordsPageSource).toContain('name="pageSize"');
    expect(recordsPageSource).toContain('<option value="25">25 por página</option>');
    expect(recordsPageSource).toContain('<option value="50">50 por página</option>');
    expect(recordsPageSource).toContain('<option value="100">100 por página</option>');
  });

  it("does not submit a stale page number when searching or changing page size", () => {
    expect(recordsPageSource).not.toContain('name="page"');
  });

  it("preserves sort and direction while searching or changing page size", () => {
    expect(recordsPageSource).toContain('name="sort"');
    expect(recordsPageSource).toContain('name="dir"');
    expect(recordsPageSource).toContain('value: "displayName"');
    expect(recordsPageSource).toContain('value: "updatedAt"');
  });

  it("resets to the first page when building sort header links", () => {
    expect(recordsPageSource).toContain("function sortHeader");
    expect(recordsPageSource).toContain("page: 1");
  });

  it("preserves sort and direction in pagination links", () => {
    expect(recordsPageSource).toContain("sort?: { key: string; direction: string } | null");
    expect(recordsPageSource).toContain('params.set("sort", sort.key)');
    expect(recordsPageSource).toContain('params.set("dir", sort.direction)');
  });
});
