import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createApiEntityRecord,
  patchApiEntityRecord,
  stableRecordRequestHash,
} from "./api-record-writes";
import { prisma } from "@/lib/prisma";

const prismaMock = vi.hoisted(() => ({
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
});
