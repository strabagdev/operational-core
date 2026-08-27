import { beforeEach, describe, expect, it, vi } from "vitest";

import { userCanAccessAppView } from "@/lib/app-view-access";
import {
  getAttendanceWorkflowDay,
  saveAttendanceWorkflowDay,
} from "@/lib/attendance-workflow";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/app-view-access", () => ({
  userCanAccessAppView: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiIdempotencyKey: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
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
const apiIdempotencyCreate = vi.mocked(prisma.apiIdempotencyKey.create);
const apiIdempotencyUpdate = vi.mocked(prisma.apiIdempotencyKey.update);
const appViewFindFirst = vi.mocked(prisma.appView.findFirst);
const entityRecordCount = vi.mocked(prisma.entityRecord.count);
const entityRecordFindMany = vi.mocked(prisma.entityRecord.findMany);
const entityTypeFindFirst = vi.mocked(prisma.entityType.findFirst);
const transaction = vi.mocked(prisma.$transaction);

type EntityRecordFindManyMockArgs = {
  include?: {
    outgoingRelations?: unknown;
    values?: unknown;
  };
  take?: number;
  where?: {
    entityTypeId?: string;
    id?: string | { in?: string[] };
    outgoingRelations?: {
      some?: {
        targetRecordId?: { in?: string[] };
      };
    };
  };
};

const tx = {
  auditEvent: {
    create: vi.fn(),
  },
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
    const id = args?.where?.id;

    if (id === "people") return sourceEntityType() as never;
    if (id === "attendance") return attendanceEntityType() as never;

    return null;
  }) as never);
  entityRecordFindMany.mockImplementation(defaultEntityRecordFindMany());
  entityRecordCount.mockResolvedValue(0 as never);
  tx.entityRecord.create.mockResolvedValue({
    displayName: "Ana · 22-08-2026",
    id: "attendance_new",
    updatedAt: new Date("2026-08-22T12:10:00.000Z"),
  });
  tx.entityRecord.update.mockResolvedValue({
    displayName: "Ana · 22-08-2026",
    id: "attendance_existing",
    updatedAt: new Date("2026-08-22T12:30:00.000Z"),
  });
  tx.entityRelation.findMany.mockResolvedValue([]);
  transaction.mockImplementation(async (callback) => callback(tx as never));
  apiIdempotencyCreate.mockResolvedValue({ id: "idempotency_1" } as never);
  apiIdempotencyUpdate.mockResolvedValue({ id: "idempotency_1" } as never);
});

describe("attendance workflow dynamic status policy", () => {
  it("creates a missing Person+Date attendance with any configured active option", async () => {
    const result = await saveAttendanceWorkflowDay(requestBody({
      entries: [{ personRecordId: "person_1", statusOptionId: "late_option" }],
    }));

    expect(result).toMatchObject({
      ok: true,
      data: {
        results: [
          { personRecordId: "person_1", recordId: "attendance_new", result: "CREATED" },
        ],
      },
    });
    expect(tx.entityRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        displayName: "Ana · 22-08-2026",
      }),
    }));
    expect(tx.entityValue.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            entityFieldId: "status_field",
            textValue: "atraso",
          }),
        ]),
      }),
    );
  });

  it("returns UNCHANGED for the same statusOptionId without writing", async () => {
    mockExistingAttendances([existingAttendance({ statusValue: "presente" })]);

    const result = await saveAttendanceWorkflowDay(requestBody({
      entries: [{ personRecordId: "person_1", statusOptionId: "present_option" }],
    }));

    expect(result).toMatchObject({
      ok: true,
      data: {
        results: [
          { personRecordId: "person_1", recordId: "attendance_existing", result: "UNCHANGED" },
        ],
      },
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(tx.entityRecord.create).not.toHaveBeenCalled();
    expect(tx.entityRecord.update).not.toHaveBeenCalled();
  });

  it("returns CONFLICT and does not update when an existing option is different", async () => {
    mockExistingAttendances([existingAttendance({ statusValue: "presente" })]);

    const result = await saveAttendanceWorkflowDay(requestBody({
      entries: [{ personRecordId: "person_1", statusOptionId: "absent_option" }],
    }));

    expect(result).toMatchObject({
      ok: true,
      data: {
        results: [
          {
            existing: {
              recordId: "attendance_existing",
              statusLabel: "PRESENTE",
              statusOptionId: "present_option",
            },
            personRecordId: "person_1",
            requested: {
              statusLabel: "AUSENTE",
              statusOptionId: "absent_option",
            },
            result: "CONFLICT",
          },
        ],
      },
    });
    expect(tx.entityRecord.update).not.toHaveBeenCalled();
    expect(tx.entityRecord.create).not.toHaveBeenCalled();
  });

  it("updates with explicit overwrite and expectedUpdatedAt", async () => {
    mockExistingAttendances([existingAttendance({ statusValue: "presente" })]);

    const result = await saveAttendanceWorkflowDay(requestBody({
      entries: [
        {
          expectedUpdatedAt: "2026-08-22T12:00:00.000Z",
          overwrite: true,
          personRecordId: "person_1",
          statusOptionId: "absent_option",
        },
      ],
    }));

    expect(result).toMatchObject({
      ok: true,
      data: {
        results: [
          { personRecordId: "person_1", recordId: "attendance_existing", result: "UPDATED" },
        ],
      },
    });
    expect(tx.entityValue.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            entityFieldId: "status_field",
            textValue: "ausente",
          }),
        ]),
      }),
    );
    expect(tx.entityRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { displayName: "Ana · 22-08-2026" },
      where: { id: "attendance_existing" },
    }));
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "RECORD_UPDATED" }),
    }));
  });

  it("returns a fresh conflict for stale overwrite confirmation", async () => {
    mockExistingAttendances([existingAttendance({ statusValue: "ausente" })]);

    const result = await saveAttendanceWorkflowDay(requestBody({
      entries: [
        {
          expectedUpdatedAt: "2026-08-22T11:00:00.000Z",
          overwrite: true,
          personRecordId: "person_1",
          statusOptionId: "present_option",
        },
      ],
    }));

    expect(result).toMatchObject({
      ok: true,
      data: {
        results: [
          {
            existing: { statusOptionId: "absent_option" },
            personRecordId: "person_1",
            requested: { statusOptionId: "present_option" },
            result: "CONFLICT",
          },
        ],
      },
    });
    expect(tx.entityRecord.update).not.toHaveBeenCalled();
  });

  it("keeps processing valid single-entry style batches when another entry conflicts", async () => {
    mockExistingAttendances([
      existingAttendance({ personRecordId: "person_1", statusValue: "presente" }),
    ]);

    const result = await saveAttendanceWorkflowDay(requestBody({
      entries: [
        { personRecordId: "person_1", statusOptionId: "absent_option" },
        { personRecordId: "person_2", statusOptionId: "present_option" },
      ],
    }));

    expect(result).toMatchObject({
      ok: true,
      data: {
        results: [
          { personRecordId: "person_1", result: "CONFLICT" },
          { personRecordId: "person_2", recordId: "attendance_new", result: "CREATED" },
        ],
      },
    });
    expect(tx.entityRecord.create).toHaveBeenCalledTimes(1);
  });

  it("rejects arbitrary or inactive option ids per entry", async () => {
    const result = await saveAttendanceWorkflowDay(requestBody({
      entries: [{ personRecordId: "person_1", statusOptionId: "inactive_option" }],
    }));

    expect(result).toMatchObject({
      ok: true,
      data: {
        results: [
          {
            code: "INVALID_STATUS_OPTION",
            personRecordId: "person_1",
            result: "ERROR",
          },
        ],
      },
    });
    expect(tx.entityRecord.create).not.toHaveBeenCalled();
  });

  it("keeps identical retries functionally idempotent", async () => {
    mockExistingAttendances([existingAttendance({ statusValue: "presente" })]);

    const result = await saveAttendanceWorkflowDay(requestBody({
      body: {
        clientRequestId: "request_1",
        date: "2026-08-22",
        entries: [{ personRecordId: "person_1", statusOptionId: "present_option" }],
      },
    }));

    expect(result).toMatchObject({
      ok: true,
      data: {
        results: [
          { personRecordId: "person_1", recordId: "attendance_existing", result: "UNCHANGED" },
        ],
      },
    });
    expect(apiIdempotencyCreate).toHaveBeenCalled();
    expect(tx.entityRecord.create).not.toHaveBeenCalled();
  });

  it("accepts legacy presentOptionId as defaultCheckInOptionId", async () => {
    appViewFindFirst.mockResolvedValue(appView({
      config: {
        workflowKey: "attendance",
        sourceEntityTypeId: "people",
        targetEntityTypeId: "attendance",
        personFieldId: "person_field",
        dateFieldId: "date_field",
        statusFieldId: "status_field",
        presentOptionId: "late_option",
        absentOptionId: "absent_option",
      },
    }) as never);

    const result = await getAttendanceWorkflowDay(dayQuery({ search: "Ana" }));

    expect(result).toMatchObject({
      ok: true,
      data: {
        statuses: expect.arrayContaining([
          expect.objectContaining({ optionId: "late_option", isDefaultCheckIn: true }),
        ]),
      },
    });
  });
});

describe("attendance workflow day query", () => {
  it("does not return the full roster by default and includes status metadata plus day summary", async () => {
    entityRecordCount.mockResolvedValue(25 as never);
    mockLatestAttendances([existingAttendance({ statusValue: "atraso" })]);

    const result = await getAttendanceWorkflowDay(dayQuery());

    expect(result).toMatchObject({
      ok: true,
      data: {
        date: "2026-08-22",
        items: [],
        latest: [
          {
            person: { id: "person_1", displayName: "Ana" },
            statusLabel: "ATRASO",
            statusOptionId: "late_option",
          },
        ],
        statuses: [
          { optionId: "present_option", label: "PRESENTE", isDefaultCheckIn: true },
          { optionId: "absent_option", label: "AUSENTE", isDefaultCheckIn: false },
          { optionId: "late_option", label: "ATRASO", isDefaultCheckIn: false },
        ],
        summary: { totalRegistered: 25 },
      },
    });
    expect(entityRecordFindMany).not.toHaveBeenCalledWith(expect.objectContaining({
      where: { entityTypeId: "people" },
    }));
  });

  it("searches people with a limited result set and returns null for missing attendance", async () => {
    mockExistingAttendances([]);

    const result = await getAttendanceWorkflowDay(dayQuery({ search: "ana" }));

    expect(result).toMatchObject({
      ok: true,
      data: {
        items: [
          {
            person: { id: "person_1", displayName: "Ana" },
            attendance: null,
          },
          {
            person: { id: "person_2", displayName: "Beto" },
            attendance: null,
          },
        ],
      },
    });
    expect(entityRecordFindMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 20,
      where: expect.objectContaining({ entityTypeId: "people" }),
    }));
  });

  it("loads one selected person directly", async () => {
    const result = await getAttendanceWorkflowDay(dayQuery({ personRecordId: "person_2" }));

    expect(result).toMatchObject({
      ok: true,
      data: {
        items: [
          {
            person: { id: "person_2", displayName: "Beto" },
          },
        ],
      },
    });
    expect(entityRecordFindMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 1,
      where: {
        entityTypeId: "people",
        id: "person_2",
      },
    }));
  });

  it("rejects config when defaultCheckInOptionId belongs to another field or is inactive", async () => {
    appViewFindFirst.mockResolvedValue(appView({
      config: {
        ...appView().config,
        defaultCheckInOptionId: "inactive_option",
      },
    }) as never);

    const result = await getAttendanceWorkflowDay(dayQuery({ search: "Ana" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
    }
  });
});

function requestBody({
  body,
  entries,
}: {
  body?: unknown;
  entries?: unknown[];
}) {
  return {
    appId: "app_1",
    appViewId: "view_attendance",
    body: body ?? {
      date: "2026-08-22",
      entries: entries ?? [],
    },
    contractId: "contract_1",
    userId: "user_1",
  };
}

function dayQuery(overrides: Partial<Parameters<typeof getAttendanceWorkflowDay>[0]> = {}) {
  return {
    appViewId: "view_attendance",
    contractId: "contract_1",
    date: "2026-08-22",
    userId: "user_1",
    ...overrides,
  };
}

function appView(overrides: Record<string, unknown> = {}) {
  return {
    config: {
      workflowKey: "attendance",
      sourceEntityTypeId: "people",
      targetEntityTypeId: "attendance",
      personFieldId: "person_field",
      dateFieldId: "date_field",
      statusFieldId: "status_field",
      defaultCheckInOptionId: "present_option",
      observationFieldId: "observation_field",
    },
    id: "view_attendance",
    name: "Asistencia",
    slug: "asistencia",
    type: "WORKFLOW",
    ...overrides,
  };
}

function sourceEntityType() {
  return {
    fields: [
      field("person_name", "nombre", "Nombre", "TEXT", { searchable: true }),
    ],
    id: "people",
    name: "Personas",
  };
}

function attendanceEntityType({
  statusOptions = [
    { id: "present_option", isActive: true, label: "PRESENTE", sortOrder: 0, value: "presente" },
    { id: "absent_option", isActive: true, label: "AUSENTE", sortOrder: 1, value: "ausente" },
    { id: "late_option", isActive: true, label: "ATRASO", sortOrder: 2, value: "atraso" },
    { id: "inactive_option", isActive: false, label: "INACTIVO", sortOrder: 3, value: "inactivo" },
  ],
}: {
  statusOptions?: Array<{ id: string; isActive: boolean; label: string; sortOrder: number; value: string }>;
} = {}) {
  return {
    fields: [
      field("person_field", "persona", "Persona", "RELATION"),
      field("date_field", "fecha", "Fecha", "DATE"),
      field("status_field", "estado", "Estado", "SELECT", { options: statusOptions }),
      field("observation_field", "observacion", "Observación", "TEXTAREA"),
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
    config: type === "RELATION" ? { targetEntityTypeId: "people", relationKind: "ONE" } : null,
    id,
    key,
    name,
    options: [],
    multiple: false,
    required: id !== "observation_field",
    searchable: false,
    sortOrder: 0,
    type,
    ...overrides,
  };
}

function people() {
  return [
    { displayName: "Ana", id: "person_1" },
    { displayName: "Beto", id: "person_2" },
  ];
}

function defaultEntityRecordFindMany(records: Array<ReturnType<typeof existingAttendance>> = []) {
  return (async (args: EntityRecordFindManyMockArgs) => {
    if (args?.where?.entityTypeId === "people") {
      if (typeof args.where.id === "string") {
        return people().filter((person) => person.id === args.where?.id) as never;
      }

      const ids = Array.isArray(args.where.id?.in)
        ? args.where.id.in
        : people().map((person) => person.id);

      return people().filter((person) => ids.includes(person.id)) as never;
    }

    return records as never;
  }) as never;
}

function mockExistingAttendances(records: Array<ReturnType<typeof existingAttendance>>) {
  entityRecordFindMany.mockImplementation((async (args: EntityRecordFindManyMockArgs) => {
    if (args?.where?.entityTypeId === "people") {
      if (typeof args.where.id === "string") {
        return people().filter((person) => person.id === args.where?.id) as never;
      }

      const ids = Array.isArray(args.where.id?.in)
        ? args.where.id.in
        : people().map((person) => person.id);

      return people().filter((person) => ids.includes(person.id)) as never;
    }

    const personIds = args?.where?.outgoingRelations?.some?.targetRecordId;
    const idSet = new Set(
      personIds && typeof personIds === "object" && Array.isArray(personIds.in)
        ? personIds.in
        : people().map((person) => person.id),
    );

    return records.filter((record) =>
      idSet.has(record.outgoingRelations[0]?.targetRecordId),
    ) as never;
  }) as never);
}

function mockLatestAttendances(records: Array<ReturnType<typeof existingAttendance>>) {
  entityRecordFindMany.mockImplementation((async (args: EntityRecordFindManyMockArgs) => {
    if (args?.where?.entityTypeId === "people") {
      return [] as never;
    }

    if (args?.include?.outgoingRelations) {
      return records.map((record) => ({
        ...record,
        outgoingRelations: record.outgoingRelations.map((relation) => ({
          ...relation,
          targetRecord: people().find((person) => person.id === relation.targetRecordId) ?? null,
        })),
      })) as never;
    }

    return [] as never;
  }) as never);
}

function existingAttendance({
  personRecordId = "person_1",
  statusValue = "presente",
  updatedAt = new Date("2026-08-22T12:00:00.000Z"),
}: {
  personRecordId?: string;
  statusValue?: string;
  updatedAt?: Date;
}) {
  return {
    displayName: `${people().find((person) => person.id === personRecordId)?.displayName ?? personRecordId} · 22-08-2026`,
    id: "attendance_existing",
    outgoingRelations: [{ targetRecordId: personRecordId }],
    updatedAt,
    values: [
      {
        dateValue: new Date("2026-08-22T00:00:00.000Z"),
        entityFieldId: "date_field",
        textValue: null,
      },
      {
        dateValue: null,
        entityFieldId: "status_field",
        textValue: statusValue,
      },
    ],
  };
}
