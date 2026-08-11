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
});
