import { Prisma } from "@prisma/client";
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
const appViewFindFirst = vi.mocked(prisma.appView.findFirst);
const entityRecordCount = vi.mocked(prisma.entityRecord.count);
const entityRecordFindMany = vi.mocked(prisma.entityRecord.findMany);
const entityTypeFindFirst = vi.mocked(prisma.entityType.findFirst);
const transaction = vi.mocked(prisma.$transaction);

const tx = {
  apiIdempotencyKey: { update: vi.fn() },
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
  tx.entityRecord.create.mockResolvedValue({
    displayName: "Excavadora · 22-08-2026",
    id: "state_new",
    updatedAt: new Date("2026-08-22T12:10:00.000Z"),
  });
  tx.entityRecord.update.mockResolvedValue({
    displayName: "Excavadora · 22-08-2026",
    id: "state_existing",
    updatedAt: new Date("2026-08-22T12:30:00.000Z"),
  });
  tx.entityRelation.findMany.mockResolvedValue([]);
  tx.apiIdempotencyKey.update.mockResolvedValue({ id: "idem_1" });
  transaction.mockImplementation(async (callback) => callback(tx as never));
  vi.mocked(prisma.apiIdempotencyKey.create).mockResolvedValue({ id: "idem_1" } as never);
  vi.mocked(prisma.apiIdempotencyKey.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.apiIdempotencyKey.update).mockResolvedValue({ id: "idem_1" } as never);
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
      data: {
        result: {
          recordId: "state_new",
          result: "CREATED",
          updatedAt: "2026-08-22T12:10:00.000Z",
        },
      },
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
              kind: "state",
              existingOptionId: "operational_ok",
              requestedOptionId: "operational_down",
            },
            {
              fieldId: "availability_field",
              kind: "state",
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
      data: {
        result: {
          recordId: "state_existing",
          result: "UPDATED",
          updatedAt: "2026-08-22T12:30:00.000Z",
        },
      },
    });
    expect(tx.entityValue.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        entityFieldId: expect.objectContaining({
          in: ["operational_field"],
        }),
      }),
    }));
    expect(tx.entityRecord.update).toHaveBeenCalled();
  });

  it("replays the stored state-update response for the same clientRequestId and payload", async () => {
    const replayData = {
      appView: { id: "view_state", name: "Estado equipos", slug: "estado-equipos" },
      result: {
        recordId: "state_new",
        result: "CREATED",
        subjectRecordId: "equipment_1",
        updatedAt: "2026-08-22T12:10:00.000Z",
      },
    };

    vi.mocked(prisma.apiIdempotencyKey.create).mockRejectedValueOnce(idempotencyUniqueError());
    vi.mocked(prisma.apiIdempotencyKey.findUnique).mockResolvedValueOnce({
      requestHash: "d57f9fef9f4edc4236bf07ecbe4a820a3ec0da57fce9a19afb558f14994686e3",
      responseBody: replayData,
    } as never);

    const result = await saveStateUpdateWorkflow(saveBody({
      clientRequestId: "request_1",
      states: { operational_field: "operational_ok" },
    }));

    expect(result).toEqual({ ok: true, data: replayData });
    expect(tx.entityRecord.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects reuse of a state-update idempotency key with another payload", async () => {
    vi.mocked(prisma.apiIdempotencyKey.create).mockRejectedValueOnce(idempotencyUniqueError());
    vi.mocked(prisma.apiIdempotencyKey.findUnique).mockResolvedValueOnce({
      requestHash: "different",
      responseBody: null,
    } as never);

    const result = await saveStateUpdateWorkflow(saveBody({
      clientRequestId: "request_1",
      states: { operational_field: "operational_ok" },
    }));

    expect(result).toMatchObject({ ok: false, response: expect.objectContaining({ status: 409 }) });
    await expect(result.ok ? null : result.response.json()).resolves.toMatchObject({
      error: { code: "IDEMPOTENCY_KEY_REUSED" },
      ok: false,
    });
    expect(tx.entityRecord.create).not.toHaveBeenCalled();
  });

  it("allows conflict resolution with a new clientRequestId while rejecting changed payload for the original key", async () => {
    mockExistingState([existingState()]);

    const conflictResult = await saveStateUpdateWorkflow(saveBody({
      clientRequestId: "conflict_key",
      states: { operational_field: "operational_down" },
    }));
    const originalHash = vi.mocked(prisma.apiIdempotencyKey.create).mock.calls[0]?.[0]?.data?.requestHash;

    expect(conflictResult).toMatchObject({
      ok: true,
      data: { result: { result: "CONFLICT" } },
    });
    expect(tx.entityRecord.update).not.toHaveBeenCalled();
    expect(prisma.apiIdempotencyKey.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        responseBody: expect.objectContaining({ result: expect.objectContaining({ result: "CONFLICT" }) }),
      }),
    }));

    const overwriteResult = await saveStateUpdateWorkflow(saveBody({
      clientRequestId: "overwrite_key",
      expectedUpdatedAt: "2026-08-22T12:00:00.000Z",
      overwrite: true,
      states: { operational_field: "operational_down" },
    }));

    expect(overwriteResult).toMatchObject({
      ok: true,
      data: { result: { result: "UPDATED", recordId: "state_existing" } },
    });
    expect(tx.entityRecord.update).toHaveBeenCalledTimes(1);

    vi.mocked(prisma.apiIdempotencyKey.create).mockRejectedValueOnce(idempotencyUniqueError());
    vi.mocked(prisma.apiIdempotencyKey.findUnique).mockResolvedValueOnce({
      requestHash: originalHash,
      responseBody: null,
    } as never);

    const reusedKeyResult = await saveStateUpdateWorkflow(saveBody({
      clientRequestId: "conflict_key",
      expectedUpdatedAt: "2026-08-22T12:00:00.000Z",
      overwrite: true,
      states: { operational_field: "operational_down" },
    }));

    expect(reusedKeyResult).toMatchObject({ ok: false, response: expect.objectContaining({ status: 409 }) });
    await expect(reusedKeyResult.ok ? null : reusedKeyResult.response.json()).resolves.toMatchObject({
      error: { code: "IDEMPOTENCY_KEY_REUSED" },
      ok: false,
    });
  });

  it("stores a durable state-update response after a new idempotent mutation", async () => {
    const result = await saveStateUpdateWorkflow(saveBody({
      clientRequestId: "request_1",
      states: { operational_field: "operational_ok" },
    }));

    expect(result).toMatchObject({ ok: true });
    expect(tx.apiIdempotencyKey.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entityRecordId: "state_new",
        responseBody: expect.objectContaining({
          result: expect.objectContaining({
            recordId: "state_new",
            updatedAt: "2026-08-22T12:10:00.000Z",
          }),
        }),
      }),
    }));
  });

  it("persists replayable UNCHANGED, CONFLICT, and functional ERROR results", async () => {
    mockExistingState([existingState()]);

    await saveStateUpdateWorkflow(saveBody({
      clientRequestId: "unchanged_key",
      states: { operational_field: "operational_ok" },
    }));
    await saveStateUpdateWorkflow(saveBody({
      clientRequestId: "conflict_key",
      states: { operational_field: "operational_down" },
    }));
    await saveStateUpdateWorkflow(saveBody({
      clientRequestId: "error_key",
      states: { operational_field: "missing_option" },
    }));

    expect(prisma.apiIdempotencyKey.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entityRecordId: "state_existing",
        responseBody: expect.objectContaining({ result: expect.objectContaining({ result: "UNCHANGED" }) }),
      }),
    }));
    expect(prisma.apiIdempotencyKey.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entityRecordId: "state_existing",
        responseBody: expect.objectContaining({ result: expect.objectContaining({ result: "CONFLICT" }) }),
      }),
    }));
    expect(prisma.apiIdempotencyKey.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entityRecordId: null,
        responseBody: expect.objectContaining({ result: expect.objectContaining({ result: "ERROR" }) }),
      }),
    }));
  });

  it("does not replay or rewrite an incomplete legacy idempotency row", async () => {
    vi.mocked(prisma.apiIdempotencyKey.create).mockRejectedValueOnce(idempotencyUniqueError());
    vi.mocked(prisma.apiIdempotencyKey.findUnique).mockResolvedValue({
      requestHash: "d57f9fef9f4edc4236bf07ecbe4a820a3ec0da57fce9a19afb558f14994686e3",
      responseBody: null,
    } as never);

    const result = await saveStateUpdateWorkflow(saveBody({
      clientRequestId: "request_1",
      states: { operational_field: "operational_ok" },
    }));

    expect(result).toMatchObject({ ok: false, response: expect.objectContaining({ status: 409 }) });
    await expect(result.ok ? null : result.response.json()).resolves.toMatchObject({
      error: { code: "IDEMPOTENCY_RESULT_UNAVAILABLE" },
      ok: false,
    });
    expect(tx.entityRecord.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid stored responseBody without rerunning writes", async () => {
    vi.mocked(prisma.apiIdempotencyKey.create).mockRejectedValueOnce(idempotencyUniqueError());
    vi.mocked(prisma.apiIdempotencyKey.findUnique).mockResolvedValueOnce({
      requestHash: "d57f9fef9f4edc4236bf07ecbe4a820a3ec0da57fce9a19afb558f14994686e3",
      responseBody: { result: { result: "CREATED" } },
    } as never);

    const result = await saveStateUpdateWorkflow(saveBody({
      clientRequestId: "request_1",
      states: { operational_field: "operational_ok" },
    }));

    expect(result).toMatchObject({ ok: false, response: expect.objectContaining({ status: 409 }) });
    expect(tx.entityRecord.create).not.toHaveBeenCalled();
  });

  it("keeps one append record for concurrent identical idempotent requests", async () => {
    appViewFindFirst.mockResolvedValue(appView({
      config: {
        ...stateConfig(),
        historyMode: "append",
        uniqueness: { mode: "none" },
      },
    }) as never);

    let storedHash = "";
    let storedResponse: unknown = null;
    vi.mocked(prisma.apiIdempotencyKey.create).mockImplementation((async (args: { data?: { requestHash?: string } }) => {
      if (!storedHash) {
        storedHash = args.data?.requestHash ?? "";
        return { id: "idem_1" } as never;
      }
      throw idempotencyUniqueError();
    }) as never);
    vi.mocked(prisma.apiIdempotencyKey.findUnique).mockImplementation((async () => ({
      requestHash: storedHash,
      responseBody: storedResponse,
    })) as never);
    tx.apiIdempotencyKey.update.mockImplementation(async (args: { data?: { responseBody?: unknown } }) => {
      storedResponse = args.data?.responseBody;
      return { id: "idem_1" } as never;
    });

    const [first, second] = await Promise.all([
      saveStateUpdateWorkflow(saveBody({
        clientRequestId: "append_key",
        states: { operational_field: "operational_ok" },
      })),
      saveStateUpdateWorkflow(saveBody({
        clientRequestId: "append_key",
        states: { operational_field: "operational_ok" },
      })),
    ]);

    expect(first).toMatchObject({ ok: true, data: { result: { recordId: "state_new", result: "CREATED" } } });
    expect(second).toEqual(first);
    expect(tx.entityRecord.create).toHaveBeenCalledTimes(1);
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it("rejects concurrent idempotency-key reuse with a different payload without a second mutation", async () => {
    appViewFindFirst.mockResolvedValue(appView({
      config: {
        ...stateConfig(),
        historyMode: "append",
        uniqueness: { mode: "none" },
      },
    }) as never);

    let storedHash = "";
    vi.mocked(prisma.apiIdempotencyKey.create).mockImplementation((async (args: { data?: { requestHash?: string } }) => {
      if (!storedHash) {
        storedHash = args.data?.requestHash ?? "";
        return { id: "idem_1" } as never;
      }
      throw idempotencyUniqueError();
    }) as never);
    vi.mocked(prisma.apiIdempotencyKey.findUnique).mockImplementation((async () => ({
      requestHash: storedHash,
      responseBody: null,
    })) as never);

    const [first, second] = await Promise.all([
      saveStateUpdateWorkflow(saveBody({
        clientRequestId: "append_key",
        states: { operational_field: "operational_ok" },
      })),
      saveStateUpdateWorkflow(saveBody({
        clientRequestId: "append_key",
        states: { operational_field: "operational_down" },
      })),
    ]);

    expect(first).toMatchObject({ ok: true, data: { result: { result: "CREATED" } } });
    expect(second).toMatchObject({ ok: false, response: expect.objectContaining({ status: 409 }) });
    await expect(second.ok ? null : second.response.json()).resolves.toMatchObject({
      error: { code: "IDEMPOTENCY_KEY_REUSED" },
      ok: false,
    });
    expect(tx.entityRecord.create).toHaveBeenCalledTimes(1);
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it("returns UNCHANGED only when requested extra values also match", async () => {
    mockExistingState([existingState({
      values: [
        ...existingState().values,
        { booleanValue: null, dateValue: null, decimalValue: null, entityFieldId: "observation_field", integerValue: null, jsonValue: null, textValue: "Sin novedad" },
      ],
    })]);

    const same = await saveStateUpdateWorkflow(saveBody({
      extraValues: { observation_field: "Sin novedad" },
      states: { operational_field: "operational_ok" },
    }));
    const different = await saveStateUpdateWorkflow(saveBody({
      extraValues: { observation_field: "Revisar en terreno" },
      states: { operational_field: "operational_ok" },
    }));

    expect(same).toMatchObject({
      ok: true,
      data: { result: { result: "UNCHANGED", updatedAt: "2026-08-22T12:00:00.000Z" } },
    });
    expect(different).toMatchObject({
      ok: true,
      data: {
        result: {
          result: "CONFLICT",
          differences: [
            {
              fieldId: "observation_field",
              kind: "extra",
              currentValue: "Sin novedad",
              requestedValue: "Revisar en terreno",
            },
          ],
        },
      },
    });
  });

  it("clears explicit null extras with overwrite and preserves omitted extras", async () => {
    mockExistingState([existingState({
      values: [
        ...existingState().values,
        { booleanValue: null, dateValue: null, decimalValue: null, entityFieldId: "observation_field", integerValue: null, jsonValue: null, textValue: "Sin novedad" },
      ],
    })]);

    const omitted = await saveStateUpdateWorkflow(saveBody({
      expectedUpdatedAt: "2026-08-22T12:00:00.000Z",
      overwrite: true,
      states: { operational_field: "operational_down" },
    }));
    const cleared = await saveStateUpdateWorkflow(saveBody({
      expectedUpdatedAt: "2026-08-22T12:00:00.000Z",
      extraValues: { observation_field: null },
      overwrite: true,
      states: { operational_field: "operational_down" },
    }));

    expect(omitted).toMatchObject({ ok: true, data: { result: { result: "UPDATED" } } });
    expect(tx.entityValue.deleteMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ entityFieldId: { in: ["operational_field"] } }),
    }));
    expect(cleared).toMatchObject({ ok: true, data: { result: { result: "UPDATED" } } });
    expect(tx.entityValue.deleteMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ entityFieldId: { in: ["operational_field", "observation_field"] } }),
    }));
  });

  it("compares SELECT extras by canonical option id", async () => {
    appViewFindFirst.mockResolvedValue(appView({
      config: {
        ...stateConfig(),
        extraFieldIds: ["condition_field"],
      },
    }) as never);
    mockExistingState([existingState({
      values: [
        ...existingState().values,
        { booleanValue: null, dateValue: null, decimalValue: null, entityFieldId: "condition_field", integerValue: null, jsonValue: null, textValue: "condition_ok" },
      ],
    })]);

    const result = await saveStateUpdateWorkflow(saveBody({
      extraValues: { condition_field: "condition_bad" },
      states: { operational_field: "operational_ok" },
    }));

    expect(result).toMatchObject({
      ok: true,
      data: {
        result: {
          result: "CONFLICT",
          differences: [
            {
              fieldId: "condition_field",
              kind: "extra",
              currentValue: "condition_ok_option",
              requestedValue: "condition_bad_option",
            },
          ],
        },
      },
    });
  });

  it("compares RELATION extras by target record id", async () => {
    appViewFindFirst.mockResolvedValue(appView({
      config: {
        ...stateConfig(),
        extraFieldIds: ["location_field"],
      },
    }) as never);
    entityRecordCount.mockResolvedValue(1 as never);
    mockExistingState([existingState({
      outgoingRelations: [
        { sourceFieldId: "subject_field", targetRecordId: "equipment_1" },
        { sourceFieldId: "location_field", targetRecordId: "location_a" },
      ],
    })]);

    const result = await saveStateUpdateWorkflow(saveBody({
      extraValues: { location_field: "location_b" },
      states: { operational_field: "operational_ok" },
    }));

    expect(result).toMatchObject({
      ok: true,
      data: {
        result: {
          result: "CONFLICT",
          differences: [
            {
              fieldId: "location_field",
              kind: "extra",
              currentValue: ["location_a"],
              requestedValue: ["location_b"],
            },
          ],
        },
      },
    });
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
    expect(tx.entityRelation.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [
        {
          sourceFieldId: "person_field",
          sourceRecordId: "state_new",
          targetRecordId: "person_1",
        },
      ],
      skipDuplicates: true,
    }));
  });

  it("does not create attendance when the subject person is not a remote source record", async () => {
    useAttendanceRuntime();
    entityRecordFindMany.mockImplementation((async (args: { where?: { entityTypeId?: string } }) => {
      if (args.where?.entityTypeId === "people") return [] as never;
      return [] as never;
    }) as never);

    const result = await saveStateUpdateWorkflow(attendanceSaveBody({
      states: { status_field: "present_option" },
      subjectRecordId: "local_only_person",
    }));

    expect(result).toMatchObject({
      ok: true,
      data: { result: { code: "INVALID_SUBJECT", result: "ERROR", subjectRecordId: "local_only_person" } },
    });
    expect(tx.entityRecord.create).not.toHaveBeenCalled();
    expect(tx.entityRelation.createMany).not.toHaveBeenCalled();
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
    expect(tx.entityRelation.deleteMany).not.toHaveBeenCalled();
    expect(tx.entityRelation.createMany).not.toHaveBeenCalled();
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
              kind: "state",
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
    expect(tx.entityRelation.deleteMany).not.toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ sourceFieldId: "person_field" }),
    }));
    expect(tx.entityRelation.createMany).not.toHaveBeenCalled();
  });

  it("replays idempotent attendance creation without duplicating the person relation", async () => {
    useAttendanceRuntime();
    const replayData = {
      appView: { id: "view_attendance", name: "Tomar asistencia", slug: "asistencia" },
      result: {
        recordId: "state_new",
        result: "CREATED",
        subjectRecordId: "person_1",
        updatedAt: "2026-08-22T12:10:00.000Z",
      },
    };

    let requestHash = "";
    vi.mocked(prisma.apiIdempotencyKey.create).mockImplementationOnce((async (args: { data?: { requestHash?: string } }) => {
      requestHash = args.data?.requestHash ?? "";
      throw idempotencyUniqueError();
    }) as never);
    vi.mocked(prisma.apiIdempotencyKey.findUnique).mockImplementationOnce((async () => ({
      requestHash,
      responseBody: replayData,
    })) as never);

    const result = await saveStateUpdateWorkflow(attendanceSaveBody({
      clientRequestId: "attendance_replay",
      states: { status_field: "present_option" },
    }));

    expect(result).toEqual({ ok: true, data: replayData });
    expect(tx.entityRecord.create).not.toHaveBeenCalled();
    expect(tx.entityRelation.createMany).not.toHaveBeenCalled();
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
      field("condition_field", "condicion", "Condición", "SELECT", {
        required: false,
        options: [
          option("condition_ok_option", "OK", "condition_ok"),
          option("condition_bad_option", "Mala", "condition_bad"),
        ],
      }),
      field("location_field", "ubicacion", "Ubicación", "RELATION", {
        config: { targetEntityTypeId: "equipment", relationKind: "ONE" },
        required: false,
      }),
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

function existingState(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
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

function idempotencyUniqueError() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    clientVersion: "test",
    code: "P2002",
    meta: { target: ["externalAppId", "operation", "clientRequestId"] },
  });
}
