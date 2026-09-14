import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DataTableShell,
  FilterBar,
  OperationalPageHeader,
  PaginationBar,
  TableScrollArea,
} from "./operational-ui";

describe("operational visual primitives", () => {
  it("renders a sticky operational header with contained actions", () => {
    const html = renderToStaticMarkup(
      <OperationalPageHeader actions={<button aria-label="Crear">Crear</button>}>
        <h1>Registros</h1>
      </OperationalPageHeader>,
    );

    expect(html).toContain('data-operational-header="true"');
    expect(html).toContain("sticky top-0");
    expect(html).toContain('data-operational-actions="true"');
    expect(html).toContain("flex shrink-0 flex-wrap");
    expect(html).toContain('aria-label="Crear"');
  });

  it("renders filter and table shells with internal overflow", () => {
    const html = renderToStaticMarkup(
      <DataTableShell>
        <FilterBar active>Filtros</FilterBar>
        <TableScrollArea>
          <table><tbody><tr><td>Dato</td></tr></tbody></table>
        </TableScrollArea>
      </DataTableShell>,
    );

    expect(html).toContain('data-table-shell="true"');
    expect(html).toContain('data-filter-bar="true"');
    expect(html).toContain('data-filter-active="true"');
    expect(html).toContain('data-table-scroll-area="true"');
    expect(html).toContain("overflow-auto");
  });

  it("renders pagination summary and actions", () => {
    const html = renderToStaticMarkup(
      <PaginationBar summary="Página 1 de 2">
        <a href="?page=2">Siguiente</a>
      </PaginationBar>,
    );

    expect(html).toContain('data-pagination-bar="true"');
    expect(html).toContain("Página 1 de 2");
    expect(html).toContain('href="?page=2"');
  });
});
