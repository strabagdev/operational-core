import { beforeEach, describe, expect, it, vi } from "vitest";

import { userCanAccessAppView } from "@/lib/app-view-access";
import { prisma } from "@/lib/prisma";
import {
  getStateUpdateWorkflow,
  normalizeStateUpdateCompatibleConfig,
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

  it("records sanitized runtime timing phases without changing the save result", async () => {
    const timing = { mark: vi.fn() };

    const result = await saveStateUpdateWorkflow({
      ...saveBody({
        states: { operational_field: "operational_ok" },
      }),
      timing,
    });

    expect(result).toMatchObject({
      ok: true,
      data: { result: { recordId: "state_new", result: "CREATED" } },
    });
    expect(timing.mark.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining([
      "workflow_config_load",
      "body_validation",
      "idempotency_lookup",
      "subject_lookup",
      "existing_target_lookup",
      "transaction_write",
    ]));
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

  it("normalizes attendance AppViews to the state-update config shape", () => {
    expect(normalizeStateUpdateCompatibleConfig(attendanceConfig())).toEqual({
      type: "WORKFLOW",
      workflowKey: "state-update",
      sourceEntityTypeId: "people",
      targetEntityTypeId: "attendance",
      subjectFieldId: "person_field",
      stateFields: [{ fieldId: "status_field", required: true, defaultOptionId: "present_option" }],
      extraFieldIds: ["observation_field"],
      dateFieldId: "date_field",
      uniqueness: { mode: "subject-date" },
      historyMode: "update-current",
    });
  });

  it("accepts an attendance AppView through the generic state-update GET", async () => {
    useAttendanceRuntime();

    const result = await getStateUpdateWorkflow(query({
      appViewId: "view_attendance",
      subjectRecordId: "person_1",
    }));

    expect(result).toMatchObject({
      ok: true,
      data: {
        appView: { id: "view_attendance" },
        stateFields: [
          {
            field: { id: "status_field", name: "Estado" },
            options: [
              { optionId: "present_option", label: "Presente" },
              { optionId: "late_option", label: "Atraso" },
              { optionId: "absent_option", label: "Ausente" },
            ],
          },
        ],
        extraFields: [{ id: "observation_field", name: "Observación" }],
        subjectEntityType: { id: "people" },
        targetEntityType: { id: "attendance" },
      },
    });
  });

  it("creates attendance via the generic state-update POST", async () => {
    useAttendanceRuntime();

    const result = await saveStateUpdateWorkflow(attendanceSaveBody({
      states: { status_field: "present_option" },
    }));

    expect(result).toMatchObject({
      ok: true,
      data: { result: { recordId: "state_new", result: "CREATED", subjectRecordId: "person_1" } },
    });
    expect(tx.entityRecord.create).toHaveBeenCalled();
  });

  it("returns UNCHANGED for the same attendance state through the generic POST", async () => {
    useAttendanceRuntime([existingAttendanceState()]);

    const result = await saveStateUpdateWorkflow(attendanceSaveBody({
      states: { status_field: "present_option" },
    }));

    expect(result).toMatchObject({
      ok: true,
      data: { result: { recordId: "attendance_existing", result: "UNCHANGED", subjectRecordId: "person_1" } },
    });
    expect(tx.entityRecord.update).not.toHaveBeenCalled();
  });

  it("returns CONFLICT for a different attendance state through the generic POST", async () => {
    useAttendanceRuntime([existingAttendanceState()]);

    const result = await saveStateUpdateWorkflow(attendanceSaveBody({
      states: { status_field: "absent_option" },
    }));

    expect(result).toMatchObject({
      ok: true,
      data: {
        result: {
          result: "CONFLICT",
          differences: [
            {
              fieldId: "status_field",
              existingOptionId: "present_option",
              requestedOptionId: "absent_option",
            },
          ],
        },
      },
    });
    expect(tx.entityRecord.update).not.toHaveBeenCalled();
  });

  it("updates attendance with overwrite through the generic state-update POST", async () => {
    useAttendanceRuntime([existingAttendanceState()]);

    const result = await saveStateUpdateWorkflow(attendanceSaveBody({
      expectedUpdatedAt: "2026-08-22T12:00:00.000Z",
      overwrite: true,
      states: { status_field: "absent_option" },
    }));

    expect(result).toMatchObject({
      ok: true,
      data: { result: { recordId: "state_existing", result: "UPDATED", subjectRecordId: "person_1" } },
    });
    expect(tx.entityRecord.update).toHaveBeenCalled();
  });

  it("keeps INVALID_WORKFLOW for workflows not compatible with state-update", async () => {
    appViewFindFirst.mockResolvedValue(appView({
      config: {
        workflowKey: "inspection",
        sourceEntityTypeId: "equipment",
        targetEntityTypeId: "equipment_state",
      },
    }) as never);

    const result = await saveStateUpdateWorkflow(saveBody({
      states: { operational_field: "operational_ok" },
    }));

    expect(result).toMatchObject({
      ok: false,
      response: expect.objectContaining({ status: 400 }),
    });
    await expect(result.ok ? null : result.response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_WORKFLOW" },
    });
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

function attendanceAppView(overrides: Record<string, unknown> = {}) {
  return {
    config: attendanceConfig(),
    id: "view_attendance",
    name: "Tomar asistencia",
    slug: "asistencia",
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

function attendanceConfig() {
  return {
    type: "WORKFLOW" as const,
    workflowKey: "attendance" as const,
    sourceEntityTypeId: "people",
    targetEntityTypeId: "attendance",
    personFieldId: "person_field",
    dateFieldId: "date_field",
    statusFieldId: "status_field",
    defaultCheckInOptionId: "present_option",
    observationFieldId: "observation_field",
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

function attendanceSourceEntityType() {
  return {
    fields: [field("person_name_field", "nombre", "Nombre", "TEXT", {
      entityTypeId: "people",
      searchable: true,
    })],
    id: "people",
    name: "Personas",
  };
}

function attendanceTargetEntityType() {
  return {
    fields: [
      field("person_field", "persona", "Persona", "RELATION", {
        config: { targetEntityTypeId: "people", relationKind: "ONE" },
        entityTypeId: "attendance",
      }),
      field("date_field", "fecha", "Fecha", "DATE", { entityTypeId: "attendance" }),
      field("status_field", "estado", "Estado", "SELECT", {
        entityTypeId: "attendance",
        options: [
          option("present_option", "Presente", "PRESENTE"),
          option("late_option", "Atraso", "ATRASO"),
          option("absent_option", "Ausente", "AUSENTE"),
        ],
      }),
      field("observation_field", "observacion", "Observación", "TEXTAREA", {
        entityTypeId: "attendance",
        required: false,
      }),
    ],
    id: "attendance",
    name: "Asistencias",
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

function attendanceRecordFindMany(records: Array<ReturnType<typeof existingAttendanceState>> = []) {
  return (async (args: { where?: { entityTypeId?: string; id?: string } }) => {
    if (args.where?.entityTypeId === "people") {
      return [{ displayName: "Persona 1", id: "person_1" }] as never;
    }

    return records as never;
  }) as never;
}

function mockExistingState(records: Array<ReturnType<typeof existingState>>) {
  entityRecordFindMany.mockImplementation(defaultRecordFindMany(records));
}

function useAttendanceRuntime(records: Array<ReturnType<typeof existingAttendanceState>> = []) {
  appViewFindFirst.mockResolvedValue(attendanceAppView() as never);
  entityTypeFindFirst.mockImplementation((async (args: { where?: { id?: string } }) => {
    if (args.where?.id === "people") return attendanceSourceEntityType() as never;
    if (args.where?.id === "attendance") return attendanceTargetEntityType() as never;
    return null;
  }) as never);
  entityRecordFindMany.mockImplementation(attendanceRecordFindMany(records));
}

function attendanceSaveBody(body: Record<string, unknown>) {
  return {
    appId: "app_1",
    appViewId: "view_attendance",
    body: {
      date: "2026-08-22",
      subjectRecordId: "person_1",
      ...body,
    },
    contractId: "contract_1",
    userId: "user_1",
  };
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

function existingAttendanceState() {
  return {
    displayName: "Persona 1 · 22-08-2026",
    id: "attendance_existing",
    outgoingRelations: [{ sourceFieldId: "person_field", targetRecordId: "person_1" }],
    updatedAt: new Date("2026-08-22T12:00:00.000Z"),
    values: [
      { booleanValue: null, dateValue: new Date("2026-08-22T00:00:00.000Z"), decimalValue: null, entityFieldId: "date_field", integerValue: null, jsonValue: null, textValue: null },
      { booleanValue: null, dateValue: null, decimalValue: null, entityFieldId: "status_field", integerValue: null, jsonValue: null, textValue: "PRESENTE" },
      { booleanValue: null, dateValue: null, decimalValue: null, entityFieldId: "observation_field", integerValue: null, jsonValue: null, textValue: null },
    ],
  };
}
