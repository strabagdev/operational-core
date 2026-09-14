import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/auth";
import {
  deserializeEntityValue,
  getEntityRecords,
  getRecordListFields,
  resolveEntityRecordSort,
} from "@/lib/entity-records";

import EntityRecordsPage from "./page";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/entity-records", () => ({
  deserializeEntityValue: vi.fn((value) => value.textValue ?? String(value.integerValue ?? "")),
  getEntityRecords: vi.fn(),
  getRecordListFields: vi.fn((fields) => fields),
  resolveEntityRecordSort: vi.fn(() => ({ explicit: true })),
}));

vi.mock("../actions", () => ({
  deleteEntityRecordsAction: vi.fn(),
  importEntityRecordsAction: vi.fn(),
}));

const authMock = vi.mocked(auth);
const getEntityRecordsMock = vi.mocked(getEntityRecords);
const getRecordListFieldsMock = vi.mocked(getRecordListFields);
const resolveEntityRecordSortMock = vi.mocked(resolveEntityRecordSort);
const deserializeEntityValueMock = vi.mocked(deserializeEntityValue);

describe("EntityRecordsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user_1" } } as never);
  });

  it("keeps operational actions, filters, columns, ordering and pagination links", async () => {
    getEntityRecordsMock.mockResolvedValue(entityRecordsData() as never);

    const html = renderToStaticMarkup(await EntityRecordsPage({
      params: Promise.resolve({ contractId: "contract_1", entityTypeId: "versions" }),
      searchParams: Promise.resolve({
        dir: "asc",
        page: "2",
        pageSize: "50",
        q: "manual",
        sort: "field:procedure_field",
      }),
    }));

    expect(getEntityRecordsMock).toHaveBeenCalledWith(expect.objectContaining({
      contractId: "contract_1",
      entityTypeId: "versions",
      page: 2,
      pageSize: 50,
      query: "manual",
      sort: { key: "field:procedure_field", direction: "asc" },
      userId: "user_1",
    }));
    expect(getRecordListFieldsMock).toHaveBeenCalled();
    expect(resolveEntityRecordSortMock).toHaveBeenCalled();
    expect(deserializeEntityValueMock).toHaveBeenCalled();
    expect(html).toContain('data-operational-header="true"');
    expect(html).toContain('data-filter-bar="true"');
    expect(html).toContain('data-filter-active="true"');
    expect(html).toContain('data-table-shell="true"');
    expect(html).toContain('data-table-scroll-area="true"');
    expect(html).toContain("Versionado");
    expect(html).toContain('aria-label="Buscar registros"');
    expect(html).toContain('value="manual"');
    expect(html).toContain("Filtro activo");
    expect(html).toContain('value="50" selected=""');
    expect(html).toContain("Descargar plantilla");
    expect(html).toContain("/app/contracts/contract_1/records/versions/template");
    expect(html).toContain("Exportar datos");
    expect(html).toContain("/app/contracts/contract_1/records/versions/export?q=manual&amp;sort=field%3Aprocedure_field&amp;dir=asc");
    expect(html).toContain("Importar Excel");
    expect(html).toContain("Crear registro");
    expect(html).toContain("/app/contracts/contract_1/records/versions/new");
    expect(html).toContain(">Procedimiento<");
    expect(html).toContain(">Fecha<");
    expect(html).toContain(">Estado<");
    expect(html.indexOf(">Procedimiento<")).toBeLessThan(html.indexOf(">Fecha<"));
    expect(html.indexOf(">Fecha<")).toBeLessThan(html.indexOf(">Estado<"));
    expect(html).toContain("Manual operativo largo");
    expect(html).toContain('title="Manual operativo largo"');
    expect(html).toContain("/app/contracts/contract_1/records/versions/record_1");
    expect(html).toContain(">Ver</a>");
    expect(html).toContain(">Editar</a>");
    expect(html).toContain("Página 2 de 4 · 76 registros");
    expect(html).toContain("/app/contracts/contract_1/records/versions?q=manual&amp;pageSize=50&amp;sort=field%3Aprocedure_field&amp;dir=asc");
    expect(html).toContain("/app/contracts/contract_1/records/versions?q=manual&amp;page=3&amp;pageSize=50&amp;sort=field%3Aprocedure_field&amp;dir=asc");
  });

  it("renders server error and empty rows without global overflow", async () => {
    getEntityRecordsMock.mockResolvedValue({
      ...entityRecordsData(),
      records: [],
      pagination: { page: 1, pageSize: 25, totalPages: 1, totalRecords: 0 },
      sort: null,
    } as never);

    const html = renderToStaticMarkup(await EntityRecordsPage({
      params: Promise.resolve({ contractId: "contract_1", entityTypeId: "versions" }),
      searchParams: Promise.resolve({ error: "No fue posible cargar registros." }),
    }));

    expect(html).toContain("No fue posible cargar registros.");
    expect(html).toContain('role="alert"');
    expect(html).toContain("No hay registros para estos filtros.");
    expect(html).toContain('data-empty-state="true"');
    expect(html).toContain("overflow-auto");
    expect(html).not.toContain("overflow-x-auto");
  });
});

function entityRecordsData() {
  return {
    entityType: {
      fields: [
        { config: null, id: "procedure_field", name: "Procedimiento", options: [], type: "TEXT" },
        { config: null, id: "date_field", name: "Fecha", options: [], type: "DATE" },
        { config: null, id: "status_field", name: "Estado", options: [], type: "SELECT" },
      ],
      icon: "clipboard-check",
      id: "versions",
      name: "Versionado",
    },
    pagination: {
      page: 2,
      pageSize: 50,
      totalPages: 4,
      totalRecords: 76,
    },
    records: [
      {
        displayName: "Manual operativo largo",
        id: "record_1",
        outgoingRelations: [],
        values: [
          { entityFieldId: "procedure_field", textValue: "Manual operativo largo" },
          { entityFieldId: "date_field", textValue: "12-09-2026" },
          { entityFieldId: "status_field", textValue: "Vigente" },
        ],
      },
    ],
    sort: { key: "field:procedure_field", direction: "asc" },
  };
}
