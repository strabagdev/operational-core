import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { auth } from "@/auth";
import {
  getAuthorizedEntityRecord,
  getIncomingRecordRelations,
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
  getIncomingRecordRelations: vi.fn(),
  getRelationOptions: vi.fn(),
}));

const authMock = vi.mocked(auth);
const getAuthorizedEntityRecordMock = vi.mocked(getAuthorizedEntityRecord);
const getIncomingRecordRelationsMock = vi.mocked(getIncomingRecordRelations);
const getRelationOptionsMock = vi.mocked(getRelationOptions);
const getRecordAuditHistoryMock = vi.mocked(getRecordAuditHistory);

describe("entity record detail relation display", () => {
  it("shows relation fields as normal field values without outgoing relation duplication", async () => {
    authMock.mockResolvedValue({ user: { id: "user_1" } } as never);
    getRelationOptionsMock.mockResolvedValue({});
    getIncomingRecordRelationsMock.mockResolvedValue([]);
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
            targetRecord: { displayName: "Oficina Técnica" },
          },
          {
            sourceFieldId: "field_areas",
            targetRecord: { displayName: "Bodega" },
          },
          {
            sourceFieldId: "field_areas",
            targetRecord: { displayName: "Minería" },
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
    expect(html).toContain("Áreas");
    expect(html).toContain("Bodega, Minería");
    expect(html).not.toContain("Sin valor");
    expect(html).not.toContain("<div>Relaciones</div>");
    expect(html).toContain("Relacionado desde");
  });
});
