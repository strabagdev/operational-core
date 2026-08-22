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
const recordTypesPageSource = readFileSync(
  new URL("../app/app/contracts/[contractId]/records/page.tsx", import.meta.url),
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

  it("does not add a synthetic displayName column to record listings", () => {
    expect(recordsPageSource).toContain("const listFields = getRecordListFields(data.entityType.fields)");
    expect(recordsPageSource).not.toContain("displayHeader");
    expect(recordsPageSource).not.toContain("primaryField?.name ?? \"Nombre\"");
    expect(recordsTableSource).not.toContain("displayHeader");
    expect(recordsTableSource).not.toContain("<SortableHeader label={displayHeader}");
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

  it("uses a sticky operational bar with entity, controls and actions", () => {
    expect(recordsPageSource).toContain("sticky top-0 z-40");
    expect(recordsPageSource).toContain("bg-background/95");
    expect(recordsPageSource).toContain("border-b border-border");
    expect(recordsPageSource).not.toContain("{data.contract.name}");
    expect(recordsPageSource).not.toContain("{data.contract.code}");
    expect(recordsPageSource).toContain("EntityIcon");
    expect(recordsPageSource).toContain("icon={data.entityType.icon}");
    expect(recordsPageSource).toContain("{data.entityType.name}");
    expect(recordsPageSource).toContain("{data.pagination.totalRecords}");
    expect(recordsPageSource).toContain("text-xl font-semibold");
    expect(recordsPageSource).toContain("RecordListControls");
    expect(recordsPageSource).toContain("lg:flex-nowrap");
    expect(recordsPageSource).toContain("ml-auto flex shrink-0 flex-nowrap items-center justify-end gap-1.5");
    expect(recordsPageSource).not.toContain("Registros operacionales de este tipo de entidad.");
  });

  it("uses icon-only header actions with accessible labels and tooltips", () => {
    expect(recordsPageSource).toContain("Download");
    expect(recordsPageSource).toContain("FileSpreadsheet");
    expect(recordsPageSource).toContain("Plus");
    expect(recordsPageSource).toContain('aria-label="Descargar plantilla"');
    expect(recordsPageSource).toContain('aria-label="Exportar datos"');
    expect(recordsPageSource).toContain('aria-label="Crear registro"');
    expect(recordsPageSource).toContain('role="tooltip"');
    expect(importSheetSource).toContain("Upload");
    expect(importSheetSource).toContain('aria-label="Importar Excel"');
    expect(importSheetSource).toContain('size="icon"');
    expect(importSheetSource).toContain('role="tooltip"');
  });

  it("keeps Excel import success feedback outside the permanent header flow", () => {
    expect(importSheetSource).toContain('role="status"');
    expect(importSheetSource).toContain("fixed right-4 top-4");
    expect(importSheetSource).toContain("compactImportNotice(nextState)");
    expect(importSheetSource).toContain("Cerrar mensaje de importación");
    expect(importSheetSource).toContain("setTimeout(() => setNotice(null), 6000)");
    expect(importSheetSource).toContain('`${created} creados · ${updated} actualizados`');
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
    expect(recordsPageSource).toContain('className="-mt-6 grid w-full gap-3"');
    expect(recordsPageSource).not.toContain('className="grid max-w-6xl gap-6"');
  });

  it("keeps record search and page size controls compact inside the operational bar", () => {
    expect(recordListControlsSource).toContain("sm:grid-cols-[minmax(180px,1fr)_auto_150px]");
    expect(recordListControlsSource).toContain("h-9 w-full");
    expect(recordListControlsSource).toContain("h-9 rounded-md");
    expect(recordsPageSource).not.toContain("pt-6");
  });

  it("keeps one styled clear action by hiding the native search cancel control", () => {
    expect(recordListControlsSource).toContain('type="search"');
    expect(recordListControlsSource).toContain('aria-label="Limpiar búsqueda"');
    expect(recordListControlsSource).toContain("clearSearch");
    expect(recordListControlsSource).toContain("[&::-webkit-search-cancel-button]:hidden");
    expect(recordListControlsSource).toContain("[&::-webkit-search-decoration]:hidden");
  });

  it("uses compact entity type cards with four responsive columns on very wide desktops", () => {
    expect(recordTypesPageSource).toContain('className="-mt-4 grid w-full gap-6"');
    expect(recordTypesPageSource).not.toContain('className="-mt-6 grid w-full gap-6"');
    expect(recordTypesPageSource).toContain('className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"');
    expect(recordTypesPageSource).toContain('CardHeader className="px-4 py-3"');
    expect(recordTypesPageSource).toContain('CardContent className="flex items-center justify-between gap-3 px-4 pb-4 pt-0"');
    expect(recordTypesPageSource).toContain("EntityIcon");
    expect(recordTypesPageSource).not.toContain("Activos:");
    expect(recordTypesPageSource).not.toContain("Total:");
    expect(recordTypesPageSource).toContain("registros");
    expect(recordTypesPageSource).toContain('className="h-8 px-3 text-xs"');
    expect(recordTypesPageSource).toContain("Abrir");
    expect(recordTypesPageSource).not.toContain("Abrir listado");
  });

  it("groups entity type cards by semantic nature without empty sections", () => {
    expect(recordTypesPageSource).toContain('{ title: "Maestras", value: "MASTER" }');
    expect(recordTypesPageSource).toContain('{ title: "Transaccionales", value: "TRANSACTION" }');
    expect(recordTypesPageSource).toContain('{ title: "Referencia", value: "REFERENCE" }');
    expect(recordTypesPageSource).toContain("entityTypes: data.entityTypes.filter((entityType) => entityType.nature === group.value)");
    expect(recordTypesPageSource).toContain(".filter((group) => group.entityTypes.length > 0)");
    expect(recordTypesPageSource).toContain("groupedEntityTypes.map");
    expect(recordTypesPageSource).toContain("group.entityTypes.map");
    expect(recordTypesPageSource).toContain("getEntityNatureLabel(entityType.nature)");
  });
});
