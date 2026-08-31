import { beforeEach, describe, expect, it, vi } from "vitest";

import { userCanAccessAppView } from "@/lib/app-view-access";
import { prisma } from "@/lib/prisma";

import { getApiReport } from "./api-reports";

vi.mock("@/lib/app-view-access", () => ({
  userCanAccessAppView: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appView: {
      findFirst: vi.fn(),
    },
    entityRecord: {
      findMany: vi.fn(),
    },
    entityType: {
      findFirst: vi.fn(),
    },
  },
}));

const userCanAccessAppViewMock = vi.mocked(userCanAccessAppView);
const appViewFindFirst = vi.mocked(prisma.appView.findFirst);
const entityTypeFindFirst = vi.mocked(prisma.entityType.findFirst);
const entityRecordFindMany = vi.mocked(prisma.entityRecord.findMany);

beforeEach(() => {
  vi.clearAllMocks();
  userCanAccessAppViewMock.mockResolvedValue(true);
  appViewFindFirst.mockResolvedValue({
    active: true,
    config: {
      entityTypeId: "attendance",
      dateFieldId: "date_field",
      presentationMode: "MATRIX",
      matrix: {
        columnFieldId: "date_field",
        rowFieldId: "person_field",
        summaryFieldId: "status_field",
        valueFieldId: "status_field",
      },
    },
    contractId: "contract_1",
    icon: null,
    id: "view_report",
    name: "Asistencia mensual",
    slug: "asistencia-mensual",
    sortOrder: 1,
    type: "REPORT",
  } as never);
  entityTypeFindFirst.mockResolvedValue(reportEntity() as never);
  entityRecordFindMany.mockResolvedValue([
    {
      displayName: "Juan 2026-08-01",
      id: "record_1",
      outgoingRelations: [
        {
          sourceFieldId: "person_field",
          targetRecord: {
            displayName: "Juan Perez",
            entityTypeId: "people",
            id: "person_1",
          },
          targetRecordId: "person_1",
        },
      ],
      updatedAt: new Date("2026-08-01T12:00:00.000Z"),
      values: [
        { entityFieldId: "date_field", dateValue: new Date("2026-08-01T00:00:00.000Z") },
        { entityFieldId: "status_field", textValue: "presente" },
      ],
    },
  ] as never);
});

describe("getApiReport", () => {
  it("queries records by configured dateFieldId and returns report metadata", async () => {
    const result = await getApiReport({
      appViewId: "view_report",
      contractId: "contract_1",
      query: { from: "2026-08-01", to: "2026-08-31" },
      userId: "user_1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(entityRecordFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        entityTypeId: "attendance",
        values: {
          some: {
            dateValue: {
              gte: new Date("2026-08-01T00:00:00.000Z"),
              lte: new Date("2026-08-31T23:59:59.999Z"),
            },
            entityFieldId: "date_field",
          },
        },
      },
    }));
    expect(result.data.config.presentationMode).toBe("MATRIX");
    expect(result.data.fields.map((field) => field.name)).toEqual(["Fecha", "Persona", "Estado"]);
    expect(result.data.fields.find((field) => field.id === "status_field")?.options?.[0]).toMatchObject({
      label: "Presente",
      value: "presente",
    });
    expect(result.data.records[0].values.persona).toEqual({
      displayName: "Juan Perez",
      entityTypeId: "people",
      id: "person_1",
    });
  });

  it("rejects inverted date ranges", async () => {
    const result = await getApiReport({
      appViewId: "view_report",
      contractId: "contract_1",
      query: { from: "2026-09-01", to: "2026-08-01" },
      userId: "user_1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
  });
});

function reportEntity() {
  return {
    fields: [
      field("date_field", "fecha", "Fecha", "DATE"),
      field("person_field", "persona", "Persona", "RELATION", {
        config: { relationKind: "ONE", targetEntityTypeId: "people" },
      }),
      field("status_field", "estado", "Estado", "SELECT", {
        options: [
          { id: "option_present", isActive: true, label: "Presente", sortOrder: 1, value: "presente" },
          { id: "option_absent", isActive: true, label: "Ausente", sortOrder: 2, value: "ausente" },
        ],
      }),
    ],
    id: "attendance",
    isActive: true,
    name: "Asistencias",
    slug: "asistencias",
  };
}

function field(
  id: string,
  key: string,
  name: string,
  type: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    config: null,
    id,
    isActive: true,
    isUnique: false,
    key,
    multiple: false,
    name,
    options: [],
    required: false,
    searchable: false,
    sortOrder: id === "date_field" ? 1 : id === "person_field" ? 2 : 3,
    type,
    ...overrides,
  };
}
