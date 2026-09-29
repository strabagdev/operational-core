import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createApiEntityRecord,
  patchApiEntityRecord,
  stableRecordRequestHash,
} from "./api-record-writes";
import { prisma } from "@/lib/prisma";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
  apiIdempotencyKey: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  auditEvent: {
    create: vi.fn(),
  },
  entityField: {
    findMany: vi.fn(),
  },
  entityRecord: {
    count: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
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
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

const textField = {
  config: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  description: null,
  entityTypeId: "entity_1",
  id: "field_codigo",
  isActive: true,
  isUnique: false,
  key: "codigo",
  multiple: false,
  name: "Código",
  options: [],
  required: true,
  searchable: true,
  sortOrder: 1,
  type: "TEXT",
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
} as const;

const noteField = {
  ...textField,
  id: "field_nota",
  key: "nota",
  name: "Nota",
  required: false,
  sortOrder: 2,
} as const;

const entity = {
  contractId: "contract_1",
  fields: [textField, noteField],
  id: "entity_1",
  isActive: true,
  name: "Equipos",
  slug: "equipos",
} as never;

const relationField = {
  ...textField,
  config: { targetEntityTypeId: "reference_entity", relationKind: "ONE" },
  id: "field_departamento",
  key: "departamento",
  name: "Departamento",
  required: false,
  sortOrder: 3,
  type: "RELATION",
} as const;

const relationPrimaryField = {
  ...relationField,
  config: {
    display: { primary: true },
    targetEntityTypeId: "reference_entity",
    relationKind: "ONE",
  },
} as const;

const timeField = {
  ...textField,
  id: "field_hora",
  key: "hora_inicio",
  name: "Hora inicio",
  required: false,
  sortOrder: 3,
  type: "TIME",
} as const;

function p2002() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    clientVersion: "6.19.3",
    code: "P2002",
    meta: {
      target: ["externalAppId", "operation", "clientRequestId"],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: "record_1" }] as never);
  vi.mocked(prisma.$transaction).mockImplementation((async (
    callback: (tx: typeof prisma) => Promise<unknown>,
  ) => callback(prisma)) as never);
  vi.mocked(prisma.apiIdempotencyKey.create).mockResolvedValue({ id: "idem_1" } as never);
  vi.mocked(prisma.apiIdempotencyKey.update).mockResolvedValue({ id: "idem_1" } as never);
  vi.mocked(prisma.auditEvent.create).mockResolvedValue({ id: "audit_1" } as never);
  vi.mocked(prisma.entityField.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.entityRecord.count).mockResolvedValue(0);
  vi.mocked(prisma.entityRecord.create).mockResolvedValue({
    displayName: "EQ-001",
    id: "record_1",
  } as never);
  vi.mocked(prisma.entityRecord.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.entityRecord.update).mockResolvedValue({
    displayName: "EQ-001",
    id: "record_1",
  } as never);
  vi.mocked(prisma.entityRelation.createMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(prisma.entityRelation.deleteMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(prisma.entityRelation.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.entityValue.createMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.entityValue.deleteMany).mockResolvedValue({ count: 2 } as never);
  vi.mocked(prisma.entityValue.findFirst).mockResolvedValue(null);
});

describe("api record writes", () => {
  it("creates a record and stores a persistent idempotency key", async () => {
    const result = await createApiEntityRecord({
      appId: "app_1",
      body: {
        clientRequestId: "client-request-1",
        values: { codigo: "EQ-001" },
      },
      contractId: "contract_1",
      entity,
      userId: "user_1",
    });

    expect(result).toEqual({ ok: true, recordId: "record_1", replay: false });
    expect(prisma.apiIdempotencyKey.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        clientRequestId: "client-request-1",
        externalAppId: "app_1",
        operation: "record:create:contract_1:entity_1",
      }),
    }));
    expect(prisma.entityRecord.create).toHaveBeenCalledWith({
      data: {
        displayName: "EQ-001",
        entityTypeId: "entity_1",
      },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it("creates EntityRelation rows from relation targetRecordId values", async () => {
    vi.mocked(prisma.entityRecord.findMany).mockResolvedValueOnce([relationTarget("target_record_1")] as never);

    const result = await createApiEntityRecord({
      appId: "app_1",
      body: {
        clientRequestId: "client-request-relation",
        values: {
          codigo: "EQ-001",
          departamento: "target_record_1",
        },
      },
      contractId: "contract_1",
      entity: {
        contractId: "contract_1",
        fields: [textField, relationField],
        id: "entity_1",
        isActive: true,
        name: "Equipos",
        slug: "equipos",
      } as never,
      userId: "user_1",
    });

    expect(result).toEqual({ ok: true, recordId: "record_1", replay: false });
    expect(prisma.entityRecord.findMany).toHaveBeenCalledWith({
      select: expect.any(Object),
      where: {
        id: { in: ["target_record_1"] },
        entityType: {
          contractId: "contract_1",
        },
      },
    });
    expect(prisma.entityRelation.createMany).toHaveBeenCalledWith({
      data: [
        {
          sourceFieldId: "field_departamento",
          sourceRecordId: "record_1",
          targetRecordId: "target_record_1",
        },
      ],
      skipDuplicates: true,
    });
  });

  it("creates API records with displayName from a RELATION ONE primary target", async () => {
    vi.mocked(prisma.entityRecord.findMany).mockResolvedValueOnce([relationTarget("target_record_1")] as never);
    vi.mocked(prisma.entityRecord.findFirst).mockResolvedValueOnce({
      displayName: "Plan de emergencias",
      id: "target_record_1",
    } as never);

    const result = await createApiEntityRecord({
      appId: "app_1",
      body: {
        clientRequestId: "client-request-relation-primary",
        values: {
          departamento: "target_record_1",
        },
      },
      contractId: "contract_1",
      entity: {
        contractId: "contract_1",
        fields: [relationPrimaryField],
        id: "entity_1",
        isActive: true,
        name: "Versionado",
        slug: "versionado",
      } as never,
      userId: "user_1",
    });

    expect(result).toEqual({ ok: true, recordId: "record_1", replay: false });
    expect(prisma.entityRecord.create).toHaveBeenCalledWith({
      data: {
        displayName: "Plan de emergencias",
        entityTypeId: "entity_1",
      },
    });
  });

  it("returns structured diagnostics for rejected relation ids without exposing other contracts", async () => {
    vi.mocked(prisma.entityRecord.findMany).mockResolvedValueOnce([]);

    const result = await createApiEntityRecord({
      appId: "app_1",
      body: {
        clientRequestId: "client-request-invalid-relation",
        values: {
          codigo: "EQ-001",
          departamento: "foreign_record",
        },
      },
      contractId: "contract_1",
      entity: {
        contractId: "contract_1",
        fields: [textField, relationField],
        id: "entity_1",
        isActive: true,
        name: "Equipos",
        slug: "equipos",
      } as never,
      userId: "user_1",
    });

    expect(result).toMatchObject({
      ok: false,
      response: expect.objectContaining({ status: 400 }),
    });
    expect(prisma.entityRecord.findMany).toHaveBeenCalledWith({
      select: expect.any(Object),
      where: {
        id: { in: ["foreign_record"] },
        entityType: {
          contractId: "contract_1",
        },
      },
    });
    await expect(result.ok ? null : result.response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "INVALID_RELATION",
        details: {
          relationDiagnostics: {
            fields: [
              {
                fieldId: "field_departamento",
                fieldName: "Departamento",
                issues: [
                  {
                    cause: "UNDETERMINED",
                    fieldId: "field_departamento",
                    relatedEntityTypeId: "reference_entity",
                    targetRecordId: "foreign_record",
                  },
                ],
                relatedEntityTypeId: "reference_entity",
                submittedRecordIds: ["foreign_record"],
              },
            ],
          },
        },
      },
    });
  });

  it("returns structured UNIQUE_FIELD_CONFLICT for duplicated unique field values", async () => {
    vi.mocked(prisma.entityValue.findFirst).mockResolvedValueOnce({
      entityRecordId: "record_existing",
      id: "value_existing",
    } as never);

    const result = await createApiEntityRecord({
      appId: "app_1",
      body: {
        clientRequestId: "client-request-unique",
        values: { codigo: "EQ-001" },
      },
      contractId: "contract_1",
      entity: {
        contractId: "contract_1",
        fields: [{ ...textField, isUnique: true }],
        id: "entity_1",
        isActive: true,
        name: "Equipos",
        slug: "equipos",
      } as never,
      userId: "user_1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected unique conflict.");
    }
    expect(result.response.status).toBe(409);
    await expect(result.response.json()).resolves.toMatchObject({
      error: {
        code: "UNIQUE_FIELD_CONFLICT",
        details: {
          conflictingRecordId: "record_existing",
          entityTypeId: "entity_1",
          fieldId: "field_codigo",
          fieldName: "Código",
          fields: [
            {
              expectedType: "UNIQUE_FIELD_VALUE",
              fieldId: "field_codigo",
              fieldLabel: "Código",
              fieldType: "TEXT",
              rejectedValue: "EQ-001",
            },
          ],
          rejectedValue: "EQ-001",
        },
        message: "Código debe ser único dentro de este tipo de entidad.",
      },
      ok: false,
    });
    expect(prisma.entityRecord.create).not.toHaveBeenCalled();
  });

  it("replays an idempotent create with the same payload without writing again", async () => {
    const requestHash = stableRecordRequestHash({
      displayName: null,
      values: { codigo: "EQ-001" },
    });
    vi.mocked(prisma.apiIdempotencyKey.create).mockRejectedValueOnce(p2002());
    vi.mocked(prisma.apiIdempotencyKey.findUnique).mockResolvedValueOnce({
      entityRecordId: "record_1",
      requestHash,
    } as never);

    const result = await createApiEntityRecord({
      appId: "app_1",
      body: {
        clientRequestId: "client-request-1",
        values: { codigo: "EQ-001" },
      },
      contractId: "contract_1",
      entity,
      userId: "user_1",
    });

    expect(result).toEqual({ ok: true, recordId: "record_1", replay: true });
    expect(prisma.entityRecord.create).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects an idempotent create when the same clientRequestId has another payload", async () => {
    vi.mocked(prisma.apiIdempotencyKey.create).mockRejectedValueOnce(p2002());
    vi.mocked(prisma.apiIdempotencyKey.findUnique).mockResolvedValueOnce({
      entityRecordId: "record_1",
      requestHash: stableRecordRequestHash({
        displayName: null,
        values: { codigo: "EQ-001" },
      }),
    } as never);

    const result = await createApiEntityRecord({
      appId: "app_1",
      body: {
        clientRequestId: "client-request-1",
        values: { codigo: "EQ-002" },
      },
      contractId: "contract_1",
      entity,
      userId: "user_1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected idempotency conflict.");
    }
    expect(result.response.status).toBe(409);
    await expect(result.response.json()).resolves.toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
      ok: false,
    });
    expect(prisma.entityRecord.create).not.toHaveBeenCalled();
  });

  it("keeps a single record when concurrent creates share clientRequestId and payload", async () => {
    const requestHash = stableRecordRequestHash({
      displayName: null,
      values: { codigo: "EQ-001" },
    });
    let firstCreate = true;
    vi.mocked(prisma.apiIdempotencyKey.create).mockImplementation((async () => {
      if (firstCreate) {
        firstCreate = false;
        return { id: "idem_1" } as never;
      }
      throw p2002();
    }) as never);
    vi.mocked(prisma.apiIdempotencyKey.findUnique).mockResolvedValue({
      entityRecordId: "record_1",
      requestHash,
    } as never);

    const [first, second] = await Promise.all([
      createApiEntityRecord({
        appId: "app_1",
        body: { clientRequestId: "client-request-1", values: { codigo: "EQ-001" } },
        contractId: "contract_1",
        entity,
        userId: "user_1",
      }),
      createApiEntityRecord({
        appId: "app_1",
        body: { clientRequestId: "client-request-1", values: { codigo: "EQ-001" } },
        contractId: "contract_1",
        entity,
        userId: "user_1",
      }),
    ]);

    expect([first.ok, second.ok]).toEqual([true, true]);
    expect(prisma.entityRecord.create).toHaveBeenCalledTimes(1);
  });

  it("rejects writes to inactive fields", async () => {
    vi.mocked(prisma.entityField.findMany).mockResolvedValueOnce([
      { key: "archivado" },
    ] as never);

    const result = await createApiEntityRecord({
      appId: "app_1",
      body: {
        clientRequestId: "client-request-1",
        values: { archivado: "no" },
      },
      contractId: "contract_1",
      entity,
      userId: "user_1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected inactive field error.");
    }
    expect(result.response.status).toBe(400);
    await expect(result.response.json()).resolves.toMatchObject({
      error: { code: "INACTIVE_FIELD" },
      ok: false,
    });
    expect(prisma.entityRecord.create).not.toHaveBeenCalled();
  });

  it("writes TIME API values as canonical text and rejects invalid formats", async () => {
    const entityWithTime = {
      contractId: "contract_1",
      fields: [textField, timeField],
      id: "entity_1",
      isActive: true,
      name: "Equipos",
      slug: "equipos",
    } as never;

    const created = await createApiEntityRecord({
      appId: "app_1",
      body: {
        clientRequestId: "client-request-1",
        values: { codigo: "EQ-001", hora_inicio: "08:30" },
      },
      contractId: "contract_1",
      entity: entityWithTime,
      userId: "user_1",
    });

    expect(created.ok).toBe(true);
    expect(prisma.entityValue.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          entityFieldId: "field_hora",
          textValue: "08:30",
        }),
      ]),
    });

    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation((async (
      callback: (tx: typeof prisma) => Promise<unknown>,
    ) => callback(prisma)) as never);
    vi.mocked(prisma.apiIdempotencyKey.create).mockResolvedValue({ id: "idem_2" } as never);
    vi.mocked(prisma.entityField.findMany).mockResolvedValue([] as never);

    const invalid = await createApiEntityRecord({
      appId: "app_1",
      body: {
        clientRequestId: "client-request-2",
        values: { codigo: "EQ-002", hora_inicio: "8:30" },
      },
      contractId: "contract_1",
      entity: entityWithTime,
      userId: "user_1",
    });

    expect(invalid.ok).toBe(false);
    if (invalid.ok) {
      throw new Error("Expected invalid TIME response.");
    }
    await expect(invalid.response.json()).resolves.toMatchObject({
      error: { code: "INVALID_FIELD_VALUE" },
      ok: false,
    });
    expect(prisma.entityRecord.create).not.toHaveBeenCalled();
  });

  it("updates only active field values while preserving omitted values in PATCH", async () => {
    vi.mocked(prisma.entityRecord.findFirst).mockResolvedValueOnce({
      displayName: "EQ-001",
      id: "record_1",
      outgoingRelations: [],
      values: [
        { entityFieldId: "field_codigo", textValue: "EQ-001" },
        { entityFieldId: "field_nota", textValue: "Anterior" },
      ],
    } as never);

    const result = await patchApiEntityRecord({
      appId: "app_1",
      body: {
        values: { nota: "Nueva" },
      },
      contractId: "contract_1",
      entity,
      recordId: "record_1",
      userId: "user_1",
    });

    expect(result).toEqual({ ok: true, recordId: "record_1" });
    expect(prisma.entityValue.deleteMany).toHaveBeenCalledWith({
      where: {
        entityFieldId: { in: ["field_codigo", "field_nota"] },
        entityRecordId: "record_1",
      },
    });
    expect(prisma.entityValue.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          entityFieldId: "field_codigo",
          textValue: "EQ-001",
        }),
        expect.objectContaining({
          entityFieldId: "field_nota",
          textValue: "Nueva",
        }),
      ]),
    });
    expect(prisma.entityRecord.update).toHaveBeenCalledWith({
      data: { displayName: "EQ-001" },
      where: { id: "record_1" },
    });
  });

  it("updates displayName when the primary field value changes in PATCH", async () => {
    vi.mocked(prisma.entityRecord.findFirst).mockResolvedValueOnce({
      displayName: "EQ-001",
      id: "record_1",
      outgoingRelations: [],
      values: [
        { entityFieldId: "field_codigo", textValue: "EQ-001" },
        { entityFieldId: "field_nota", textValue: "Anterior" },
      ],
    } as never);

    const result = await patchApiEntityRecord({
      appId: "app_1",
      body: {
        values: { codigo: "EQ-002" },
      },
      contractId: "contract_1",
      entity,
      recordId: "record_1",
      userId: "user_1",
    });

    expect(result).toEqual({ ok: true, recordId: "record_1" });
    expect(prisma.entityRecord.update).toHaveBeenCalledWith({
      data: { displayName: "EQ-002" },
      where: { id: "record_1" },
    });
  });

  it("updates API record displayName when a RELATION ONE primary target changes", async () => {
    vi.mocked(prisma.entityRecord.findFirst)
      .mockResolvedValueOnce({
        displayName: "Plan antiguo",
        id: "record_1",
        outgoingRelations: [
          {
            sourceFieldId: "field_departamento",
            targetRecordId: "target_record_1",
          },
        ],
        values: [],
      } as never)
      .mockResolvedValueOnce({
        displayName: "Plan de emergencias",
        id: "target_record_2",
      } as never);
    vi.mocked(prisma.entityRecord.findMany).mockResolvedValueOnce([relationTarget("target_record_2")] as never);

    const result = await patchApiEntityRecord({
      appId: "app_1",
      body: {
        values: { departamento: "target_record_2" },
      },
      contractId: "contract_1",
      entity: {
        contractId: "contract_1",
        fields: [relationPrimaryField],
        id: "entity_1",
        isActive: true,
        name: "Versionado",
        slug: "versionado",
      } as never,
      recordId: "record_1",
      userId: "user_1",
    });

    expect(result).toEqual({ ok: true, recordId: "record_1" });
    expect(prisma.entityRecord.update).toHaveBeenCalledWith({
      data: { displayName: "Plan de emergencias" },
      where: { id: "record_1" },
    });
  });

  it("keeps legacy PATCH behavior and rejects an incomplete idempotency pair", async () => {
    for (const body of [
      { clientRequestId: "patch-1", values: { nota: "Nueva" } },
      { expectedUpdatedAt: "2026-01-01T00:00:00.000Z", values: { nota: "Nueva" } },
    ]) {
      const result = await patchApiEntityRecord({
        appId: "app_1",
        body,
        contractId: "contract_1",
        entity,
        recordId: "record_1",
        userId: "user_1",
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected invalid idempotency pair.");
      await expect(result.response.json()).resolves.toMatchObject({
        error: { code: "INVALID_RECORD_BODY" },
        ok: false,
      });
    }

    expect(prisma.apiIdempotencyKey.create).not.toHaveBeenCalled();
  });

  it("replays the original PATCH result after a lost response without a second mutation", async () => {
    const before = patchRecord("Anterior", "2026-01-01T00:00:00.000Z");
    const after = patchRecord("Nueva", "2026-01-01T00:01:00.000Z");
    vi.mocked(prisma.entityRecord.findFirst)
      .mockResolvedValueOnce(before as never)
      .mockResolvedValueOnce(after as never);

    const first = await patchApiEntityRecord({
      appId: "app_1",
      body: idempotentPatchBody("patch-lost-response", "Nueva"),
      contractId: "contract_1",
      entity,
      recordId: "record_1",
      userId: "user_1",
    });

    expect(first.ok).toBe(true);
    if (!first.ok || !("directResponse" in first) || !first.directResponse) throw new Error("Expected direct response.");
    const originalBody = await first.directResponse.json();
    const createData = vi.mocked(prisma.apiIdempotencyKey.create).mock.calls[0]?.[0].data;
    const stored = vi.mocked(prisma.apiIdempotencyKey.update).mock.calls[0]?.[0].data.responseBody;

    vi.mocked(prisma.apiIdempotencyKey.create).mockRejectedValueOnce(p2002());
    vi.mocked(prisma.apiIdempotencyKey.findUnique).mockResolvedValueOnce({
      requestHash: createData?.requestHash,
      responseBody: stored,
    } as never);
    vi.mocked(prisma.entityRecord.findFirst).mockResolvedValue(
      patchRecord("Cambio posterior", "2026-01-01T00:02:00.000Z") as never,
    );

    const replay = await patchApiEntityRecord({
      appId: "app_1",
      body: idempotentPatchBody("patch-lost-response", "Nueva"),
      contractId: "contract_1",
      entity,
      recordId: "record_1",
      userId: "user_1",
    });

    expect(replay.ok).toBe(true);
    if (!replay.ok || !("directResponse" in replay) || !replay.directResponse) throw new Error("Expected replay response.");
    await expect(replay.directResponse.json()).resolves.toEqual(originalBody);
    expect(prisma.entityRecord.update).toHaveBeenCalledTimes(1);
    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.entityRecord.findFirst).toHaveBeenCalledTimes(2);
  });

  it("rejects reuse of a PATCH key with different content or user", async () => {
    const originalHash = stableRecordRequestHash({
      clientRequestId: "patch-reused",
      contractId: "contract_1",
      displayName: { present: false },
      entityTypeId: "entity_1",
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      recordId: "record_1",
      userId: "user_1",
      values: { nota: "Nueva" },
    });
    vi.mocked(prisma.apiIdempotencyKey.create).mockRejectedValue(p2002());
    vi.mocked(prisma.apiIdempotencyKey.findUnique).mockResolvedValue({
      requestHash: originalHash,
      responseBody: { body: { ok: true }, status: 200 },
    } as never);

    for (const input of [
      { note: "Distinta", userId: "user_1" },
      { note: "Nueva", userId: "user_2" },
    ]) {
      const result = await patchApiEntityRecord({
        appId: "app_1",
        body: idempotentPatchBody("patch-reused", input.note),
        contractId: "contract_1",
        entity,
        recordId: "record_1",
        userId: input.userId,
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected key reuse conflict.");
      await expect(result.response.json()).resolves.toMatchObject({
        error: { code: "IDEMPOTENCY_KEY_REUSED" },
        ok: false,
      });
    }

    expect(prisma.entityRecord.update).not.toHaveBeenCalled();
  });

  it("stores and replays a stale-version conflict without modifying the record", async () => {
    vi.mocked(prisma.entityRecord.findFirst).mockResolvedValueOnce(
      patchRecord("Remota", "2026-01-01T00:02:00.000Z") as never,
    );

    const result = await patchApiEntityRecord({
      appId: "app_1",
      body: idempotentPatchBody("patch-stale", "Local"),
      contractId: "contract_1",
      entity,
      recordId: "record_1",
      userId: "user_1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok || !("directResponse" in result) || !result.directResponse) throw new Error("Expected conflict response.");
    expect(result.directResponse.status).toBe(409);
    await expect(result.directResponse.json()).resolves.toMatchObject({
      error: {
        code: "REMOTE_VERSION_CHANGED",
        details: { record: { updatedAt: "2026-01-01T00:02:00.000Z" } },
      },
      ok: false,
    });
    expect(prisma.entityRecord.update).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
    expect(prisma.apiIdempotencyKey.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ responseBody: expect.objectContaining({ status: 409 }) }),
    }));
  });

  it("stores and replays a functional PATCH error without rerunning validation", async () => {
    vi.mocked(prisma.entityRecord.findFirst).mockResolvedValueOnce(
      patchRecord("Anterior", "2026-01-01T00:00:00.000Z") as never,
    );
    const command = {
      appId: "app_1",
      body: {
        clientRequestId: "patch-invalid",
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
        values: { inexistente: "valor" },
      },
      contractId: "contract_1",
      entity,
      recordId: "record_1",
      userId: "user_1",
    };

    const first = await patchApiEntityRecord(command);

    expect(first.ok).toBe(true);
    if (!first.ok || !("directResponse" in first) || !first.directResponse) {
      throw new Error("Expected direct error response.");
    }
    expect(first.directResponse.status).toBe(400);
    const firstBody = await first.directResponse.json();
    const createData = vi.mocked(prisma.apiIdempotencyKey.create).mock.calls[0]?.[0].data;
    const stored = vi.mocked(prisma.apiIdempotencyKey.update).mock.calls[0]?.[0].data.responseBody;

    vi.mocked(prisma.apiIdempotencyKey.create).mockRejectedValueOnce(p2002());
    vi.mocked(prisma.apiIdempotencyKey.findUnique).mockResolvedValueOnce({
      requestHash: createData?.requestHash,
      responseBody: stored,
    } as never);

    const replay = await patchApiEntityRecord(command);

    expect(replay.ok).toBe(true);
    if (!replay.ok || !("directResponse" in replay) || !replay.directResponse) {
      throw new Error("Expected direct replay response.");
    }
    expect(replay.directResponse.status).toBe(400);
    await expect(replay.directResponse.json()).resolves.toEqual(firstBody);
    expect(prisma.entityField.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.entityRecord.update).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it("does not duplicate effects when the same PATCH key is submitted concurrently", async () => {
    let requestHash: string | undefined;
    let storedResponse: unknown;
    let reserved = false;
    vi.mocked(prisma.apiIdempotencyKey.create).mockImplementation((async (args: {
      data: { requestHash: string };
    }) => {
      if (reserved) throw p2002();
      reserved = true;
      requestHash = args.data.requestHash;
      return { id: "idem_concurrent" };
    }) as never);
    vi.mocked(prisma.apiIdempotencyKey.update).mockImplementation((async (args: {
      data: { responseBody: unknown };
    }) => {
      storedResponse = args.data.responseBody;
      return { id: "idem_concurrent" };
    }) as never);
    vi.mocked(prisma.apiIdempotencyKey.findUnique).mockImplementation((async () => ({
      requestHash,
      responseBody: storedResponse,
    })) as never);
    vi.mocked(prisma.entityRecord.findFirst)
      .mockResolvedValueOnce(patchRecord("Anterior", "2026-01-01T00:00:00.000Z") as never)
      .mockResolvedValueOnce(patchRecord("Nueva", "2026-01-01T00:01:00.000Z") as never);

    const command = {
      appId: "app_1",
      body: idempotentPatchBody("patch-concurrent", "Nueva"),
      contractId: "contract_1",
      entity,
      recordId: "record_1",
      userId: "user_1",
    };
    const [first, second] = await Promise.all([
      patchApiEntityRecord(command),
      patchApiEntityRecord(command),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(prisma.entityRecord.update).toHaveBeenCalledTimes(1);
    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it("serializes two distinct commands based on the same version", async () => {
    vi.mocked(prisma.entityRecord.findFirst)
      .mockResolvedValueOnce(patchRecord("Anterior", "2026-01-01T00:00:00.000Z") as never)
      .mockResolvedValueOnce(patchRecord("Primera", "2026-01-01T00:01:00.000Z") as never)
      .mockResolvedValueOnce(patchRecord("Primera", "2026-01-01T00:01:00.000Z") as never);

    const first = await patchApiEntityRecord({
      appId: "app_1",
      body: idempotentPatchBody("patch-first", "Primera"),
      contractId: "contract_1",
      entity,
      recordId: "record_1",
      userId: "user_1",
    });
    const second = await patchApiEntityRecord({
      appId: "app_1",
      body: idempotentPatchBody("patch-second", "Segunda"),
      contractId: "contract_1",
      entity,
      recordId: "record_1",
      userId: "user_1",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!second.ok || !("directResponse" in second) || !second.directResponse) throw new Error("Expected conflict response.");
    expect(second.directResponse.status).toBe(409);
    expect(prisma.entityRecord.update).toHaveBeenCalledTimes(1);
    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it("scopes identical PATCH keys by external app", async () => {
    vi.mocked(prisma.entityRecord.findFirst)
      .mockResolvedValueOnce(patchRecord("Anterior", "2026-01-01T00:00:00.000Z") as never)
      .mockResolvedValueOnce(patchRecord("Nueva", "2026-01-01T00:01:00.000Z") as never);

    await patchApiEntityRecord({
      appId: "app_2",
      body: idempotentPatchBody("shared-key", "Nueva"),
      contractId: "contract_1",
      entity,
      recordId: "record_1",
      userId: "user_1",
    });

    expect(prisma.apiIdempotencyKey.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        clientRequestId: "shared-key",
        externalAppId: "app_2",
        operation: "record:patch:contract_1:entity_1:record_1",
      }),
    }));
  });
});

function idempotentPatchBody(clientRequestId: string, note: string) {
  return {
    clientRequestId,
    expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
    values: { nota: note },
  };
}

function patchRecord(note: string, updatedAt: string) {
  return {
    displayName: "EQ-001",
    id: "record_1",
    outgoingRelations: [],
    updatedAt: new Date(updatedAt),
    values: [
      { entityFieldId: "field_codigo", textValue: "EQ-001" },
      { entityFieldId: "field_nota", textValue: note },
    ],
  };
}

function relationTarget(id: string, overrides: Record<string, unknown> = {}) {
  return {
    displayName: id,
    entityType: {
      contractId: "contract_1",
      id: "reference_entity",
      name: "Referencia",
    },
    entityTypeId: "reference_entity",
    id,
    ...overrides,
  };
}
