import { beforeEach, describe, expect, it, vi } from "vitest";

import { userCanAccessAppView } from "@/lib/app-view-access";
import { prisma } from "@/lib/prisma";
import {
  getStateUpdateWorkflow,
  saveStateUpdateWorkflow,
} from "@/lib/state-update-workflow";

vi.mock("@/lib/app-view-access", () => ({
  userCanAccessAppView: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiIdempotencyKey: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    appView: {
      findFirst: vi.fn(),
    },
    entityRecord: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    entityType: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const userCanAccessAppViewMock = vi.mocked(userCanAccessAppView);
const appViewFindFirst = vi.mocked(prisma.appView.findFirst);
const entityRecordCount = vi.mocked(prisma.entityRecord.count);
const entityRecordFindMany = vi.mocked(prisma.entityRecord.findMany);
const entityTypeFindFirst = vi.mocked(prisma.entityType.findFirst);
const transaction = vi.mocked(prisma.$transaction);

const tx = {
  auditEvent: { create: vi.fn() },
  entityRecord: {
    create: vi.fn(),
    update: vi.fn(),
  },
  entityRelation: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
  },
  entityValue: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  userCanAccessAppViewMock.mockResolvedValue(true);
  appViewFindFirst.mockResolvedValue(appView() as never);
  entityTypeFindFirst.mockImplementation((async (args: { where?: { id?: string } }) => {
    if (args.where?.id === "equipment") return sourceEntityType() as never;
    if (args.where?.id === "equipment_state") return targetEntityType() as never;
    return null;
  }) as never);
  entityRecordCount.mockResolvedValue(0 as never);
  entityRecordFindMany.mockImplementation(defaultRecordFindMany());
  tx.entityRecord.create.mockResolvedValue({ displayName: "Excavadora · 22-08-2026", id: "state_new" });
  tx.entityRecord.update.mockResolvedValue({ displayName: "Excavadora · 22-08-2026", id: "state_existing" });
  tx.entityRelation.findMany.mockResolvedValue([]);
  transaction.mockImplementation(async (callback) => callback(tx as never));
  vi.mocked(prisma.apiIdempotencyKey.create).mockResolvedValue({ id: "idem_1" } as never);
});

describe("state-update workflow runtime", () => {
  it("does not return all subjects by default and exposes state metadata", async () => {
    const result = await getStateUpdateWorkflow(query());

    expect(result).toMatchObject({
      ok: true,
      data: {
        subjects: [],
        stateFields: [
          {
            field: { id: "operational_field", name: "Estado operacional" },
            options: [
              { optionId: "operational_ok", label: "Operativo" },
              { optionId: "operational_down", label: "Detenido" },
            ],
          },
          {
            field: { id: "availability_field", name: "Disponibilidad" },
          },
        ],
      },
    });
  });

  it("creates append history without looking for an existing record", async () => {
    appViewFindFirst.mockResolvedValue(appView({
      config: {
        ...stateConfig(),
        historyMode: "append",
        uniqueness: { mode: "none" },
      },
    }) as never);

    const result = await saveStateUpdateWorkflow(saveBody({
      states: { operational_field: "operational_ok" },
    }));

    expect(result).toMatchObject({
      ok: true,
      data: { result: { recordId: "state_new", result: "CREATED" } },
    });
    expect(tx.entityRecord.create).toHaveBeenCalled();
  });

  it("returns differences for multiple state field conflicts", async () => {
    mockExistingState([existingState()]);

    const result = await saveStateUpdateWorkflow(saveBody({
      states: {
        operational_field: "operational_down",
        availability_field: "availability_no",
      },
    }));

    expect(result).toMatchObject({
      ok: true,
      data: {
        result: {
          result: "CONFLICT",
          differences: [
            {
              fieldId: "operational_field",
              existingOptionId: "operational_ok",
              requestedOptionId: "operational_down",
            },
            {
              fieldId: "availability_field",
              existingOptionId: "availability_yes",
              requestedOptionId: "availability_no",
            },
          ],
        },
      },
    });
    expect(tx.entityRecord.update).not.toHaveBeenCalled();
  });

  it("updates current state with overwrite and expectedUpdatedAt", async () => {
    mockExistingState([existingState()]);

    const result = await saveStateUpdateWorkflow(saveBody({
      expectedUpdatedAt: "2026-08-22T12:00:00.000Z",
      overwrite: true,
      states: { operational_field: "operational_down" },
    }));

    expect(result).toMatchObject({
      ok: true,
      data: { result: { recordId: "state_existing", result: "UPDATED" } },
    });
    expect(tx.entityValue.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        entityFieldId: expect.objectContaining({
          in: expect.arrayContaining(["operational_field", "availability_field", "observation_field", "date_field", "subject_field"]),
        }),
      }),
    }));
    expect(tx.entityRecord.update).toHaveBeenCalled();
  });
});

function query(overrides: Partial<Parameters<typeof getStateUpdateWorkflow>[0]> = {}) {
  return {
    appViewId: "view_state",
    contractId: "contract_1",
    date: "2026-08-22",
    userId: "user_1",
    ...overrides,
  };
}

function saveBody(body: Record<string, unknown>) {
  return {
    appId: "app_1",
    appViewId: "view_state",
    body: {
      date: "2026-08-22",
      subjectRecordId: "equipment_1",
      ...body,
    },
    contractId: "contract_1",
    userId: "user_1",
  };
}

function appView(overrides: Record<string, unknown> = {}) {
  return {
    config: stateConfig(),
    id: "view_state",
    name: "Estado equipos",
    slug: "estado-equipos",
    type: "WORKFLOW",
    ...overrides,
  };
}

function stateConfig() {
  return {
    workflowKey: "state-update",
    sourceEntityTypeId: "equipment",
    targetEntityTypeId: "equipment_state",
    subjectFieldId: "subject_field",
    stateFields: [
      { fieldId: "operational_field", required: true, defaultOptionId: "operational_ok" },
      { fieldId: "availability_field", required: false },
    ],
    extraFieldIds: ["observation_field"],
    dateFieldId: "date_field",
    uniqueness: { mode: "subject-date" },
    historyMode: "update-current",
  };
}

function sourceEntityType() {
  return {
    fields: [field("name_field", "nombre", "Nombre", "TEXT", { searchable: true })],
    id: "equipment",
    name: "Equipos",
  };
}

function targetEntityType() {
  return {
    fields: [
      field("subject_field", "equipo", "Equipo", "RELATION", {
        config: { targetEntityTypeId: "equipment", relationKind: "ONE" },
      }),
      field("date_field", "fecha", "Fecha", "DATE"),
      field("operational_field", "operacional", "Estado operacional", "SELECT", {
        options: [
          option("operational_ok", "Operativo", "operativo"),
          option("operational_down", "Detenido", "detenido"),
        ],
      }),
      field("availability_field", "disponibilidad", "Disponibilidad", "SELECT", {
        required: false,
        options: [
          option("availability_yes", "Disponible", "disponible"),
          option("availability_no", "No disponible", "no_disponible"),
        ],
      }),
      field("observation_field", "observacion", "Observación", "TEXTAREA", { required: false }),
    ],
    id: "equipment_state",
    name: "Estados equipo",
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
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    description: null,
    entityTypeId: id === "name_field" ? "equipment" : "equipment_state",
    id,
    isActive: true,
    isUnique: false,
    key,
    multiple: false,
    name,
    options: [],
    required: true,
    searchable: false,
    sortOrder: 0,
    type,
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function option(id: string, label: string, value: string) {
  return { id, isActive: true, label, sortOrder: 0, value };
}

function defaultRecordFindMany(records: Array<ReturnType<typeof existingState>> = []) {
  return (async (args: { where?: { entityTypeId?: string; id?: string } }) => {
    if (args.where?.entityTypeId === "equipment") {
      return [{ displayName: "Excavadora", id: "equipment_1" }] as never;
    }

    return records as never;
  }) as never;
}

function mockExistingState(records: Array<ReturnType<typeof existingState>>) {
  entityRecordFindMany.mockImplementation(defaultRecordFindMany(records));
}

function existingState() {
  return {
    displayName: "Excavadora · 22-08-2026",
    id: "state_existing",
    outgoingRelations: [{ sourceFieldId: "subject_field", targetRecordId: "equipment_1" }],
    updatedAt: new Date("2026-08-22T12:00:00.000Z"),
    values: [
      { booleanValue: null, dateValue: new Date("2026-08-22T00:00:00.000Z"), decimalValue: null, entityFieldId: "date_field", integerValue: null, jsonValue: null, textValue: null },
      { booleanValue: null, dateValue: null, decimalValue: null, entityFieldId: "operational_field", integerValue: null, jsonValue: null, textValue: "operativo" },
      { booleanValue: null, dateValue: null, decimalValue: null, entityFieldId: "availability_field", integerValue: null, jsonValue: null, textValue: "disponible" },
    ],
  };
}
