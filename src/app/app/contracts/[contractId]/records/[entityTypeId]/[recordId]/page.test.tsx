import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { auth } from "@/auth";
import {
  getAuthorizedEntityRecord,
  getIncomingRecordRelationGroups,
  getRelationOptions,
} from "@/lib/entity-records";
import { getRecordAuditHistory } from "@/lib/audit";

import EntityRecordDetailPage from "./page";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  auditActionLabels: {},
  formatAuditValue: vi.fn((value) => String(value)),
  getRecordAuditHistory: vi.fn(),
}));

vi.mock("@/lib/entity-records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/entity-records")>()),
  getAuthorizedEntityRecord: vi.fn(),
  getIncomingRecordRelationGroups: vi.fn(),
  getRelationOptions: vi.fn(),
}));

const authMock = vi.mocked(auth);
const getAuthorizedEntityRecordMock = vi.mocked(getAuthorizedEntityRecord);
const getIncomingRecordRelationGroupsMock = vi.mocked(getIncomingRecordRelationGroups);
const getRelationOptionsMock = vi.mocked(getRelationOptions);
const getRecordAuditHistoryMock = vi.mocked(getRecordAuditHistory);

describe("entity record detail relation display", () => {
  it("does not render the incoming relations section when there are no incoming relations", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } } as never);
    getRelationOptionsMock.mockResolvedValue({});
    getIncomingRecordRelationGroupsMock.mockResolvedValue([]);
    getRecordAuditHistoryMock.mockResolvedValue({ events: [], pagination: {} } as never);
    getAuthorizedEntityRecordMock.mockResolvedValue(detailData() as never);

    const html = renderToStaticMarkup(
      await EntityRecordDetailPage({
        params: Promise.resolve({
          contractId: "contract_1",
          entityTypeId: "entity_1",
          recordId: "record_1",
        }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).not.toContain("Relacionado desde");
    expect(html).not.toContain("No hay registros apuntando hacia este registro.");
  });

  it("shows relation fields as links without outgoing relation duplication", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } } as never);
    getRelationOptionsMock.mockResolvedValue({});
    getIncomingRecordRelationGroupsMock.mockResolvedValue([
      {
        sourceEntityTypeId: "source_entity",
        sourceEntityTypeName: "Contratos",
        sourceFieldId: "source_field",
        sourceFieldName: "Responsable",
        total: 1,
        preview: [{ recordId: "source_record_1", displayName: "Contrato fuente" }],
      },
    ] as never);
    getRecordAuditHistoryMock.mockResolvedValue({ events: [], pagination: {} } as never);
    getAuthorizedEntityRecordMock.mockResolvedValue({
      contract: { id: "contract_1" },
      entityType: {
        id: "entity_1",
        name: "Personas",
        fields: [
          {
            id: "field_department",
            name: "Departamento",
            type: "RELATION",
            config: { targetEntityTypeId: "departments", relationKind: "ONE" },
            options: [],
          },
          {
            id: "field_areas",
            name: "Áreas",
            type: "RELATION",
            config: { targetEntityTypeId: "departments", relationKind: "MANY" },
            options: [],
          },
        ],
      },
      record: {
        id: "record_1",
        displayName: "Ana",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        values: [],
        outgoingRelations: [
          {
            sourceFieldId: "field_department",
            targetRecordId: "target_department",
            targetRecord: {
              displayName: "Oficina Técnica",
              entityTypeId: "departments",
              id: "target_department",
            },
          },
          {
            sourceFieldId: "field_areas",
            targetRecordId: "target_bodega",
            targetRecord: {
              displayName: "Bodega",
              entityTypeId: "departments",
              id: "target_bodega",
            },
          },
          {
            sourceFieldId: "field_areas",
            targetRecordId: "target_mineria",
            targetRecord: {
              displayName: "Minería",
              entityTypeId: "departments",
              id: "target_mineria",
            },
          },
        ],
      },
    } as never);

    const html = renderToStaticMarkup(
      await EntityRecordDetailPage({
        params: Promise.resolve({
          contractId: "contract_1",
          entityTypeId: "entity_1",
          recordId: "record_1",
        }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain("Departamento");
    expect(html).toContain("Oficina Técnica");
    expect(html).toContain(
      'href="/app/contracts/contract_1/records/departments/target_department"',
    );
    expect(html).toContain("Áreas");
    expect(html).toContain("Bodega");
    expect(html).toContain("Minería");
    expect(html).toContain(
      'href="/app/contracts/contract_1/records/departments/target_bodega"',
    );
    expect(html).toContain(
      'href="/app/contracts/contract_1/records/departments/target_mineria"',
    );
    expect(html).not.toContain("Sin valor");
    expect(html).not.toContain("<div>Relaciones</div>");
    expect(html).toContain("Relacionado desde");
    expect(html).toContain(
      'href="/app/contracts/contract_1/records/source_entity/source_record_1"',
    );
    expect(html).toContain("1 registro relacionado");
    expect(html).toContain("Ver todos (1)");
    expect(html).not.toContain(">target_department<");
    expect(html).not.toContain(">target_bodega<");
    expect(html).not.toContain(">target_mineria<");
  });

  it("renders grouped incoming relation previews and a contextual view-all link", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } } as never);
    getRelationOptionsMock.mockResolvedValue({});
    getIncomingRecordRelationGroupsMock.mockResolvedValue([
      {
        sourceEntityTypeId: "people",
        sourceEntityTypeName: "Personas",
        sourceFieldId: "department",
        sourceFieldName: "Departamento",
        total: 148,
        preview: [
          { recordId: "person_1", displayName: "Ana" },
          { recordId: "person_2", displayName: "Beto" },
          { recordId: "person_3", displayName: "Carla" },
        ],
      },
      {
        sourceEntityTypeId: "teams",
        sourceEntityTypeName: "Equipos",
        sourceFieldId: "team_department",
        sourceFieldName: "Departamento",
        total: 12,
        preview: [
          { recordId: "team_1", displayName: "Equipo Norte" },
          { recordId: "team_2", displayName: "Equipo Sur" },
        ],
      },
    ] as never);
    getRecordAuditHistoryMock.mockResolvedValue({ events: [], pagination: {} } as never);
    getAuthorizedEntityRecordMock.mockResolvedValue(detailData() as never);

    const html = renderToStaticMarkup(
      await EntityRecordDetailPage({
        params: Promise.resolve({
          contractId: "contract_1",
          entityTypeId: "entity_1",
          recordId: "record_1",
        }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain("Personas");
    expect(html).toContain("148 registros relacionados");
    expect(html).toContain("Ana");
    expect(html).toContain("Beto");
    expect(html).toContain("Carla");
    expect(html).toContain(
      'href="/app/contracts/contract_1/records/people/person_1"',
    );
    expect(html).toContain(
      'href="/app/contracts/contract_1/records/entity_1/record_1/relations?sourceEntityTypeId=people&amp;sourceFieldId=department"',
    );
    expect(html).toContain("Ver todos (148)");
    expect(html).toContain("Equipos");
    expect(html).toContain("12 registros relacionados");
    expect(html).toContain(
      'href="/app/contracts/contract_1/records/entity_1/record_1/relations?sourceEntityTypeId=teams&amp;sourceFieldId=team_department"',
    );
    expect(html).not.toContain("Mediante campo Departamento");
    expect(html).not.toContain("person_4");
  });

  it("renders missing relation targets as safe non-linked text", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } } as never);
    getRelationOptionsMock.mockResolvedValue({});
    getIncomingRecordRelationGroupsMock.mockResolvedValue([]);
    getRecordAuditHistoryMock.mockResolvedValue({ events: [], pagination: {} } as never);
    getAuthorizedEntityRecordMock.mockResolvedValue({
      contract: { id: "contract_1" },
      entityType: {
        id: "entity_1",
        name: "Personas",
        fields: [
          {
            id: "field_department",
            name: "Departamento",
            type: "RELATION",
            config: { targetEntityTypeId: "departments", relationKind: "ONE" },
            options: [],
          },
        ],
      },
      record: {
        id: "record_1",
        displayName: "Ana",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        values: [],
        outgoingRelations: [
          {
            sourceFieldId: "field_department",
            targetRecord: {
              displayName: "Registro relacionado no disponible",
              entityTypeId: null,
              id: null,
            },
          },
        ],
      },
    } as never);

    const html = renderToStaticMarkup(
      await EntityRecordDetailPage({
        params: Promise.resolve({
          contractId: "contract_1",
          entityTypeId: "entity_1",
          recordId: "record_1",
        }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain("Registro relacionado no disponible");
    expect(html).not.toContain("/app/contracts/contract_1/records/departments/");
  });
});

function detailData() {
  return {
    contract: { id: "contract_1" },
    entityType: {
      id: "entity_1",
      name: "Departamentos",
      fields: [],
    },
    record: {
      id: "record_1",
      displayName: "Oficina Técnica",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      values: [],
      outgoingRelations: [],
    },
  };
}
