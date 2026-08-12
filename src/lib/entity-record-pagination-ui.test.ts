import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const recordsPageSource = readFileSync(
  new URL("../app/app/contracts/[contractId]/records/[entityTypeId]/page.tsx", import.meta.url),
  "utf8",
);
const importSheetSource = readFileSync(
  new URL("../app/app/contracts/[contractId]/records/[entityTypeId]/import-records-sheet.tsx", import.meta.url),
  "utf8",
);

describe("entity record pagination UI", () => {
  it("offers the supported page sizes in the listing filter form", () => {
    expect(recordsPageSource).toContain('name="pageSize"');
    expect(recordsPageSource).toContain('<option value="25">25 por página</option>');
    expect(recordsPageSource).toContain('<option value="50">50 por página</option>');
    expect(recordsPageSource).toContain('<option value="100">100 por página</option>');
  });

  it("defaults record listings to the smallest page size", () => {
    expect(recordsPageSource).toContain("return parsed === 25 || parsed === 50 || parsed === 100 ? parsed : 25");
    expect(recordsPageSource).toContain("if (pageSize !== 25) params.set");
    expect(recordsPageSource).not.toContain("? parsed : 50");
    expect(recordsPageSource).not.toContain("if (pageSize !== 50) params.set");
  });

  it("does not submit a stale page number when searching or changing page size", () => {
    expect(recordsPageSource).not.toContain('name="page"');
  });

  it("preserves sort and direction while searching or changing page size", () => {
    expect(recordsPageSource).toContain('name="sort"');
    expect(recordsPageSource).toContain('name="dir"');
    expect(recordsPageSource).toContain('value: "displayName"');
    expect(recordsPageSource).toContain('value: "updatedAt"');
    expect(recordsPageSource).toContain('defaultValue={data.sort?.key ?? "displayName"}');
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

  it("exposes separate Excel template, export, and import actions", () => {
    expect(recordsPageSource).toContain("Descargar plantilla");
    expect(recordsPageSource).toContain("Exportar datos");
    expect(recordsPageSource).toContain("ImportRecordsSheet");
    expect(recordsPageSource).toContain("/export");
  });

  it("preserves visual sort and direction in the Excel export link", () => {
    expect(recordsPageSource).toContain("function exportHref");
    expect(recordsPageSource).toContain("sort: data.sort");
    expect(recordsPageSource).toContain('params.set("sort", sort.key)');
    expect(recordsPageSource).toContain('params.set("dir", sort.direction)');
  });

  it("shows create/update counts in the Excel import preview", () => {
    expect(importSheetSource).toContain('label="Nuevos"');
    expect(importSheetSource).toContain('label="Actualizaciones"');
    expect(importSheetSource).toContain("importButtonLabel");
  });

  it("lets the record listing use the available horizontal space", () => {
    expect(recordsPageSource).toContain('className="grid w-full gap-6"');
    expect(recordsPageSource).not.toContain('className="grid max-w-6xl gap-6"');
  });
});
