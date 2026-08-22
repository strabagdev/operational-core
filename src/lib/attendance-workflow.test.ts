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
    },
    appView: {
      findFirst: vi.fn(),
    },
    entityRecord: {
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
const appViewFindFirst = vi.mocked(prisma.appView.findFirst);
const entityRecordFindMany = vi.mocked(prisma.entityRecord.findMany);
const entityTypeFindFirst = vi.mocked(prisma.entityType.findFirst);
const transaction = vi.mocked(prisma.$transaction);

type EntityRecordFindManyMockArgs = {
  where?: {
    entityTypeId?: string;
    id?: { in?: string[] };
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
  entityRecordFindMany.mockImplementation((async (args: EntityRecordFindManyMockArgs) => {
    if (args?.where?.entityTypeId === "people") {
      const ids = Array.isArray(args.where.id?.in)
        ? args.where.id.in
        : ["person_1"];

      return people().filter((person) => ids.includes(person.id)) as never;
    }

    return [] as never;
  }) as never);
  tx.entityRecord.create.mockResolvedValue({
    displayName: "Ana 2026-08-22",
    id: "attendance_new",
  });
  tx.entityRecord.update.mockResolvedValue({
    displayName: "Ana 2026-08-22",
    id: "attendance_existing",
  });
  tx.entityRelation.findMany.mockResolvedValue([]);
  transaction.mockImplementation(async (callback) => callback(tx as never));
  apiIdempotencyCreate.mockResolvedValue({ id: "idempotency_1" } as never);
});

describe("attendance workflow save policy", () => {
  it("creates a missing Person+Date attendance", async () => {
    const result = await saveAttendanceWorkflowDay(requestBody({
      entries: [{ personRecordId: "person_1", status: "PRESENTE" }],
    }));

    expect(result).toMatchObject({
      ok: true,
      data: {
        results: [
          { personRecordId: "person_1", recordId: "attendance_new", result: "CREATED" },
        ],
      },
    });
    expect(tx.entityRecord.create).toHaveBeenCalledTimes(1);
    expect(tx.entityValue.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            entityFieldId: "status_field",
            textValue: "presente",
          }),
        ]),
      }),
    );
    expect(tx.entityRecord.update).not.toHaveBeenCalled();
  });

  it("stores optional observation when creating attendance", async () => {
    await saveAttendanceWorkflowDay(requestBody({
      entries: [
        {
          observation: "Llegó con inducción hecha",
          personRecordId: "person_1",
          status: "PRESENTE",
        },
      ],
    }));

    expect(tx.entityValue.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            entityFieldId: "observation_field",
            textValue: "Llegó con inducción hecha",
          }),
        ]),
      }),
    );
  });

  it("persists the real absent option value when creating AUSENTE", async () => {
    await saveAttendanceWorkflowDay(requestBody({
      entries: [{ personRecordId: "person_1", status: "AUSENTE" }],
    }));

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
  });

  it("returns UNCHANGED for the same status without creating another record", async () => {
    mockExistingAttendances([existingAttendance({ status: "PRESENTE" })]);

    const result = await saveAttendanceWorkflowDay(requestBody({
      entries: [{ personRecordId: "person_1", status: "PRESENTE" }],
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
  });

  it("returns CONFLICT and does not modify an existing different status", async () => {
    mockExistingAttendances([existingAttendance({ status: "PRESENTE" })]);

    const result = await saveAttendanceWorkflowDay(requestBody({
      entries: [{ personRecordId: "person_1", status: "AUSENTE" }],
    }));

    expect(result).toMatchObject({
      ok: true,
      data: {
        results: [
          {
            existing: {
              recordId: "attendance_existing",
              status: "PRESENTE",
            },
            personRecordId: "person_1",
            requestedStatus: "AUSENTE",
            result: "CONFLICT",
          },
        ],
      },
    });
    expect(tx.entityRecord.update).not.toHaveBeenCalled();
    expect(tx.entityRecord.create).not.toHaveBeenCalled();
  });

  it("updates with explicit overwrite and expected status", async () => {
    mockExistingAttendances([existingAttendance({ status: "PRESENTE" })]);

    const result = await saveAttendanceWorkflowDay(requestBody({
      entries: [
        {
          expectedStatus: "PRESENTE",
          overwrite: true,
          personRecordId: "person_1",
          status: "AUSENTE",
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
    expect(tx.entityRecord.update).toHaveBeenCalledTimes(1);
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
    expect(tx.auditEvent.create).toHaveBeenCalled();
  });

  it("maps arbitrary configured option values to domain statuses", async () => {
    entityTypeFindFirst.mockImplementation((async (args: { where?: { id?: string } }) => {
      const id = args?.where?.id;

      if (id === "people") return sourceEntityType() as never;
      if (id === "attendance") {
        return attendanceEntityType({
          statusOptions: [
            { id: "present_option", isActive: true, label: "Presente", value: "P" },
            { id: "absent_option", isActive: true, label: "Ausente", value: "A" },
          ],
        }) as never;
      }

      return null;
    }) as never);
    mockExistingAttendances([existingAttendance({ statusValue: "P" })]);

    const result = await saveAttendanceWorkflowDay(requestBody({
      entries: [{ personRecordId: "person_1", status: "AUSENTE" }],
    }));

    expect(result).toMatchObject({
      ok: true,
      data: {
        results: [
          {
            existing: { status: "PRESENTE" },
            requestedStatus: "AUSENTE",
            result: "CONFLICT",
          },
        ],
      },
    });
  });

  it("does not duplicate records for conflicts", async () => {
    mockExistingAttendances([existingAttendance({ status: "PRESENTE" })]);

    await saveAttendanceWorkflowDay(requestBody({
      entries: [{ personRecordId: "person_1", status: "AUSENTE" }],
    }));

    expect(tx.entityRecord.create).not.toHaveBeenCalled();
  });

  it("keeps processing valid entries when another entry conflicts", async () => {
    mockExistingAttendances([
      existingAttendance({ personRecordId: "person_1", status: "PRESENTE" }),
    ]);

    const result = await saveAttendanceWorkflowDay(requestBody({
      entries: [
        { personRecordId: "person_1", status: "AUSENTE" },
        { personRecordId: "person_2", status: "PRESENTE" },
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

  it("returns a fresh conflict when overwrite confirmation has a stale expected status", async () => {
    mockExistingAttendances([existingAttendance({ status: "AUSENTE" })]);

    const result = await saveAttendanceWorkflowDay(requestBody({
      entries: [
        {
          expectedStatus: "PRESENTE",
          overwrite: true,
          personRecordId: "person_1",
          status: "PRESENTE",
        },
      ],
    }));

    expect(result).toMatchObject({
      ok: true,
      data: {
        results: [
          {
            existing: { status: "AUSENTE" },
            personRecordId: "person_1",
            requestedStatus: "PRESENTE",
            result: "CONFLICT",
          },
        ],
      },
    });
    expect(tx.entityRecord.update).not.toHaveBeenCalled();
  });

  it("keeps identical retries functionally idempotent", async () => {
    mockExistingAttendances([existingAttendance({ status: "PRESENTE" })]);

    const result = await saveAttendanceWorkflowDay(requestBody({
      body: {
        clientRequestId: "request_1",
        date: "2026-08-22",
        entries: [{ personRecordId: "person_1", status: "PRESENTE" }],
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

  it("returns ERROR for a person outside the configured source entity", async () => {
    const result = await saveAttendanceWorkflowDay(requestBody({
      entries: [{ personRecordId: "foreign_person", status: "PRESENTE" }],
    }));

    expect(result).toMatchObject({
      ok: true,
      data: {
        results: [
          {
            code: "INVALID_PERSON",
            personRecordId: "foreign_person",
            result: "ERROR",
          },
        ],
      },
    });
    expect(tx.entityRecord.create).not.toHaveBeenCalled();
  });

  it("rejects an AppView without access", async () => {
    userCanAccessAppViewMock.mockResolvedValueOnce(false);

    const result = await saveAttendanceWorkflowDay(requestBody({
      entries: [{ personRecordId: "person_1", status: "PRESENTE" }],
    }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });
});

describe("attendance workflow day query", () => {
  it("returns people with current attendance and null for missing attendance", async () => {
    mockExistingAttendances([
      existingAttendance({ personRecordId: "person_1", status: "PRESENTE" }),
    ]);

    const result = await getAttendanceWorkflowDay({
      appViewId: "view_attendance",
      contractId: "contract_1",
      date: "2026-08-22",
      userId: "user_1",
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        date: "2026-08-22",
        items: [
          {
            person: { id: "person_1", displayName: "Ana" },
            attendance: {
              recordId: "attendance_existing",
              status: "PRESENTE",
            },
          },
          {
            person: { id: "person_2", displayName: "Beto" },
            attendance: null,
          },
        ],
      },
    });
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

function appView() {
  return {
    config: {
      workflowKey: "attendance",
      sourceEntityTypeId: "people",
      targetEntityTypeId: "attendance",
      personFieldId: "person_field",
      dateFieldId: "date_field",
      statusFieldId: "status_field",
      presentOptionId: "present_option",
      absentOptionId: "absent_option",
      observationFieldId: "observation_field",
    },
    id: "view_attendance",
    name: "Asistencia",
    slug: "asistencia",
    type: "WORKFLOW",
  };
}

function sourceEntityType() {
  return {
    id: "people",
    name: "Personas",
  };
}

function attendanceEntityType({
  statusOptions = [
    { id: "present_option", isActive: true, label: "PRESENTE", value: "presente" },
    { id: "absent_option", isActive: true, label: "AUSENTE", value: "ausente" },
    { id: "late_option", isActive: true, label: "ATRASO", value: "atraso" },
  ],
}: {
  statusOptions?: Array<{ id: string; isActive: boolean; label: string; value: string }>;
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
    options: type === "SELECT"
      ? [
          { id: "present_option", isActive: true, label: "PRESENTE", value: "presente" },
          { id: "absent_option", isActive: true, label: "AUSENTE", value: "ausente" },
        ]
      : [],
    multiple: false,
    required: id !== "observation_field",
    searchable: true,
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

function mockExistingAttendances(records: Array<ReturnType<typeof existingAttendance>>) {
  entityRecordFindMany.mockImplementation((async (args: EntityRecordFindManyMockArgs) => {
    if (args?.where?.entityTypeId === "people") {
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

function existingAttendance({
  personRecordId = "person_1",
  status,
  statusValue,
  updatedAt = new Date("2026-08-22T12:00:00.000Z"),
}: {
  personRecordId?: string;
  status?: "PRESENTE" | "AUSENTE";
  statusValue?: string;
  updatedAt?: Date;
}) {
  return {
    displayName: `${personRecordId} 2026-08-22`,
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
        textValue: statusValue ?? (status === "AUSENTE" ? "ausente" : "presente"),
      },
    ],
  };
}
