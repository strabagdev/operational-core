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
      valueDisplay: {
        status_field: "INTERNAL_VALUE",
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
    expect(result.data.config.timeFilter).toEqual({
      allowChange: true,
      defaultPeriod: "CURRENT_MONTH",
      mode: "RANGE",
    });
    expect(result.data.config.valueDisplay).toEqual({
      status_field: "INTERNAL_VALUE",
    });
    expect(result.data.fields.map((field) => field.name)).toEqual(["Fecha", "Persona", "Estado"]);
    expect(result.data.fields.find((field) => field.id === "status_field")?.options?.[0]).toMatchObject({
      id: "option_present",
      label: "Presente",
      value: "presente",
    });
    expect(result.data.records[0].values.estado).toBe("presente");
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

  it("returns STATE_UPDATE CURRENT report rows for every subject", async () => {
    appViewFindFirst
      .mockResolvedValueOnce({
        active: true,
        config: {
          sourceMode: "STATE_UPDATE",
          stateUpdateAppViewId: "view_versionado",
          projection: "CURRENT",
          presentationMode: "TABLE",
          table: {
            visibleFieldIds: ["subject.displayName", "state:status_field", "state:revision_field", "state:approved_field"],
            defaultSortFieldId: "state:revision_field",
            defaultSortDirection: "desc",
          },
        },
        contractId: "contract_1",
        icon: null,
        id: "view_report",
        name: "Estado actual",
        slug: "estado-actual",
        sortOrder: 1,
        type: "REPORT",
      } as never)
      .mockResolvedValueOnce(stateUpdateWorkflowAppView() as never);
    entityTypeFindFirst
      .mockResolvedValueOnce({
        fields: [],
        id: "procedures",
        name: "Procedimientos",
        slug: "procedimientos",
      } as never)
      .mockResolvedValueOnce(stateUpdateTargetEntity() as never);
    entityRecordFindMany
      .mockResolvedValueOnce([
        { displayName: "PET-001", id: "procedure_1" },
        { displayName: "PET-002", id: "procedure_2" },
      ] as never)
      .mockResolvedValueOnce([
        {
          displayName: "Versionado PET-001",
          id: "version_3",
          outgoingRelations: [
            { sourceFieldId: "subject_field", targetRecordId: "procedure_1" },
          ],
          updatedAt: new Date("2026-08-03T12:00:00.000Z"),
          values: [
            { entityFieldId: "status_field", textValue: "vigente" },
            { entityFieldId: "revision_field", integerValue: 3 },
            { booleanValue: true, entityFieldId: "approved_field" },
          ],
        },
      ] as never);

    const result = await getApiReport({
      appViewId: "view_report",
      contractId: "contract_1",
      query: { from: "2026-08-01", to: "2026-08-31" },
      userId: "user_1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(entityRecordFindMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { entityTypeId: "procedures" },
    }));
    expect(entityRecordFindMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        entityTypeId: "versions",
        outgoingRelations: {
          some: {
            sourceFieldId: "subject_field",
            targetRecordId: { in: ["procedure_1", "procedure_2"] },
          },
        },
      }),
    }));
    expect(result.data.config).toMatchObject({
      sourceMode: "STATE_UPDATE",
      projection: "CURRENT",
      presentationMode: "TABLE",
    });
    expect(result.data.entity).toEqual({
      id: "procedures",
      name: "Procedimientos",
      slug: "procedimientos",
    });
    expect(result.data.fields.map((field) => field.key)).toEqual([
      "subject.displayName",
      "state:status_field",
      "state:revision_field",
      "state:approved_field",
    ]);
    expect(result.data.records).toHaveLength(2);
    expect(result.data.records[0]).toMatchObject({
      currentRecordId: "version_3",
      currentUpdatedAt: "2026-08-03T12:00:00.000Z",
      id: "procedure_1",
      states: {
        status_field: { optionId: "status_current", label: "Vigente" },
        revision_field: 3,
        approved_field: true,
      },
      subject: { displayName: "PET-001", id: "procedure_1" },
      values: {
        "subject.displayName": "PET-001",
        "state:status_field": { optionId: "status_current", label: "Vigente" },
        "state:revision_field": 3,
        "state:approved_field": true,
      },
    });
    expect(result.data.records[1]).toMatchObject({
      currentRecordId: null,
      currentUpdatedAt: null,
      id: "procedure_2",
      states: {},
      subject: { displayName: "PET-002", id: "procedure_2" },
      values: {
        "subject.displayName": "PET-002",
        "state:status_field": null,
        "state:revision_field": null,
        "state:approved_field": null,
      },
    });
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

function stateUpdateWorkflowAppView() {
  return {
    active: true,
    config: {
      workflowKey: "state-update",
      sourceEntityTypeId: "procedures",
      targetEntityTypeId: "versions",
      subjectFieldId: "subject_field",
      stateFields: [
        { fieldId: "status_field", required: true },
        { fieldId: "revision_field", required: true },
        { fieldId: "approved_field", required: false },
      ],
      extraFieldIds: [],
      uniqueness: { mode: "subject" },
      historyMode: "append",
    },
    contractId: "contract_1",
    id: "view_versionado",
    name: "Versionado",
    slug: "versionado",
    sortOrder: 1,
    type: "WORKFLOW",
  };
}

function stateUpdateTargetEntity() {
  return {
    fields: [
      field("subject_field", "procedimiento", "Procedimiento", "RELATION", {
        config: { relationKind: "ONE", targetEntityTypeId: "procedures" },
      }),
      field("status_field", "estatus", "Estatus", "SELECT", {
        options: [
          { id: "status_current", isActive: true, label: "Vigente", sortOrder: 1, value: "vigente" },
          { id: "status_review", isActive: true, label: "En revisión", sortOrder: 2, value: "en_revision" },
        ],
      }),
      field("revision_field", "revision", "Revisión", "INTEGER"),
      field("approved_field", "aprobado", "Aprobado", "BOOLEAN"),
    ],
    id: "versions",
    name: "Versionado",
    slug: "versionado",
  };
}
