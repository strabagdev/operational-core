import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const recordsPageSource = readFileSync(
  new URL("../app/app/contracts/[contractId]/records/[entityTypeId]/page.tsx", import.meta.url),
  "utf8",
);
const recordListControlsSource = readFileSync(
  new URL("../app/app/contracts/[contractId]/records/[entityTypeId]/record-list-controls.tsx", import.meta.url),
  "utf8",
);
const recordsTableSource = readFileSync(
  new URL("../app/app/contracts/[contractId]/records/[entityTypeId]/entity-records-table.tsx", import.meta.url),
  "utf8",
);
const recordDetailSource = readFileSync(
  new URL("../app/app/contracts/[contractId]/records/[entityTypeId]/[recordId]/page.tsx", import.meta.url),
  "utf8",
);
const importSheetSource = readFileSync(
  new URL("../app/app/contracts/[contractId]/records/[entityTypeId]/import-records-sheet.tsx", import.meta.url),
  "utf8",
);

describe("entity record pagination UI", () => {
  it("offers the supported page sizes in the listing filter form", () => {
    expect(recordListControlsSource).toContain('aria-label="Registros por página"');
    expect(recordListControlsSource).toContain('name="pageSize"');
    expect(recordListControlsSource).toContain('<option value="25">25 por página</option>');
    expect(recordListControlsSource).toContain('<option value="50">50 por página</option>');
    expect(recordListControlsSource).toContain('<option value="100">100 por página</option>');
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

  it("uses a debounced automatic search input that does not submit a form", () => {
    expect(recordsPageSource).toContain("RecordListControls");
    expect(recordsPageSource).toContain("totalRecords={data.pagination.totalRecords}");
    expect(recordListControlsSource).toContain("const searchDebounceMs = 300");
    expect(recordListControlsSource).toContain("router.replace(href, { scroll: false })");
    expect(recordListControlsSource).toContain('aria-label="Buscar registros"');
    expect(recordListControlsSource).toContain('placeholder="Buscar registros..."');
    expect(recordListControlsSource).toContain('aria-label="Limpiar búsqueda"');
    expect(recordListControlsSource).not.toContain('type="submit"');
  });

  it("shows only the scoped total in the compact controls instead of a list header", () => {
    expect(recordListControlsSource).toContain("{totalRecords} registro{totalRecords === 1 ? \"\" : \"s\"}");
    expect(recordsPageSource).not.toContain("<CardHeader>");
    expect(recordsPageSource).not.toContain("<CardTitle>Listado</CardTitle>");
    expect(recordsPageSource).not.toContain("data.records.length} de");
  });

  it("removes global sort controls while preserving sort state through URL helpers", () => {
    expect(recordListControlsSource).not.toContain('name="sort"');
    expect(recordListControlsSource).not.toContain('name="dir"');
    expect(recordListControlsSource).not.toContain("Ordenar por");
    expect(recordListControlsSource).not.toContain("Ascendente");
    expect(recordListControlsSource).not.toContain("Descendente");
    expect(recordsPageSource).toContain("searchParams={{ dir, page, pageSize, q, sort }}");
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

  it("keeps sorting on table headers", () => {
    expect(recordsTableSource).toContain("function SortableHeader");
    expect(recordsTableSource).toContain("href={sort.href}");
    expect(recordsTableSource).toContain("ArrowUp");
    expect(recordsTableSource).toContain("ArrowDown");
  });

  it("keeps updated timestamps out of record listings", () => {
    expect(recordsTableSource).not.toContain('label="Actualizado"');
    expect(recordsTableSource).not.toContain("record.updatedAt");
    expect(recordsPageSource).not.toContain("updatedAtSort");
    expect(recordsPageSource).not.toContain("record.updatedAt.toLocaleDateString");
  });

  it("exposes separate view and edit actions for each record", () => {
    expect(recordsTableSource).toContain("entityRecordDetailPath(contractId, entityTypeId, record.id)");
    expect(recordsTableSource).toContain("entityRecordEditPath(contractId, entityTypeId, record.id)");
    expect(recordsTableSource).toContain("Ver");
    expect(recordsTableSource).toContain("Editar");
    expect(recordsTableSource.indexOf("entityRecordDetailPath")).toBeLessThan(
      recordsTableSource.indexOf("entityRecordEditPath"),
    );
  });

  it("shows record creation and update metadata only on the profile page", () => {
    expect(recordDetailSource).toContain("<CardTitle>Metadata</CardTitle>");
    expect(recordDetailSource).toContain("<dt className=\"text-sm font-medium\">Creado</dt>");
    expect(recordDetailSource).toContain("data.record.createdAt.toLocaleString(\"es-CL\")");
    expect(recordDetailSource).toContain("<dt className=\"text-sm font-medium\">Actualizado</dt>");
    expect(recordDetailSource).toContain("data.record.updatedAt.toLocaleString(\"es-CL\")");
    expect(recordDetailSource).toContain("entityRecordEditPath(contractId, entityTypeId, recordId)");
    expect(recordDetailSource).toContain("getAuthorizedEntityRecord(");
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
