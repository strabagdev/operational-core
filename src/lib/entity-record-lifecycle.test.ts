import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntityFieldType, Prisma } from "@prisma/client";

import {
  buildEntityRecordSearchWhere,
  createEntityRecord,
  getEntityRecords,
  getRelationOptions,
} from "./entity-records";
import { prisma } from "./prisma";

vi.mock("./contracts", () => ({
  getAuthorizedContract: vi.fn(async () => ({
    id: "contract_1",
    organizationId: "org_1",
    name: "Contrato",
    code: "CON",
    description: null,
    status: "ACTIVE",
    slug: "contrato",
    organization: { id: "org_1", name: "Org" },
  })),
}));

vi.mock("./prisma", () => ({
  prisma: {
    entityType: {
      findFirst: vi.fn(),
    },
    entityRecord: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const entityTypeFindFirst = vi.mocked(prisma.entityType.findFirst);
const entityRecordCount = vi.mocked(prisma.entityRecord.count);
const entityRecordFindMany = vi.mocked(prisma.entityRecord.findMany);
const transaction = vi.mocked(prisma.$transaction);
type TestField = ReturnType<typeof field>;

beforeEach(() => {
  vi.clearAllMocks();
  entityTypeFindFirst.mockResolvedValue(entityType([field("name")]) as never);
  entityRecordCount.mockResolvedValue(0);
  entityRecordFindMany.mockResolvedValue([]);
});

describe("entity records without technical status", () => {
  it("creates EntityRecord without status or archive data", async () => {
    const currentTx = tx();
    currentTx.entityRecord.create.mockResolvedValue({ id: "record_1", displayName: "Registro sin nombre" });
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      createEntityRecord("contract_1", "entity_1", "user_1", new FormData()),
    ).resolves.toMatchObject({ id: "record_1" });

    expect(currentTx.entityRecord.create).toHaveBeenCalledWith({
      data: {
        entityTypeId: "entity_1",
        displayName: "Registro sin nombre",
      },
    });
  });

  it("lists all existing records without a status where clause", async () => {
    entityRecordCount.mockResolvedValue(2);
    entityRecordFindMany.mockResolvedValue([
      record("record_1"),
      record("record_2"),
    ] as never);

    await expect(
      getEntityRecords({
        contractId: "contract_1",
        entityTypeId: "entity_1",
        userId: "user_1",
      }),
    ).resolves.toMatchObject({
      pagination: { totalRecords: 2 },
      records: [{ id: "record_1" }, { id: "record_2" }],
    });
    const countArgs = entityRecordCount.mock.calls[0]?.[0];
    const findManyArgs = entityRecordFindMany.mock.calls[0]?.[0];

    expect(countArgs?.where).not.toHaveProperty("status");
    expect(findManyArgs?.where).not.toHaveProperty("status");
  });

  it("searches and paginates without a status filter", () => {
    const where = buildEntityRecordSearchWhere({
      entityTypeId: "entity_1",
      fields: [field("name")],
      query: "persona",
    });

    expect(where).toMatchObject({ entityTypeId: "entity_1", OR: expect.any(Array) });
    expect(where).not.toHaveProperty("status");
  });

  it("shows relation options for any existing target record", async () => {
    const relationField = field("owner", {
      type: "RELATION",
      config: {
        targetEntityTypeId: "target_entity",
        relationKind: "ONE",
      },
    });

    entityTypeFindFirst.mockResolvedValue(entityType([relationField]) as never);
    entityRecordFindMany.mockResolvedValue([
      {
        id: "target_1",
        displayName: "Antiguo archivado",
        entityType: { name: "Personas" },
      },
    ] as never);

    await expect(
      getRelationOptions("contract_1", "entity_1", "user_1"),
    ).resolves.toEqual({
      owner: [
        {
          id: "target_1",
          displayName: "Antiguo archivado",
          entityTypeName: "Personas",
        },
      ],
    });
    const findManyArgs = entityRecordFindMany.mock.calls[0]?.[0];

    expect(findManyArgs?.where).not.toHaveProperty("status");
  });
});

function tx() {
  return {
    entityRecord: {
      create: vi.fn(),
    },
    entityValue: {
      createMany: vi.fn(),
    },
    entityRelation: {
      deleteMany: vi.fn(),
      findMany: vi.fn(async () => []),
      createMany: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
  };
}

function entityType(fields: TestField[]) {
  return {
    id: "entity_1",
    contractId: "contract_1",
    name: "Personas",
    fields,
  };
}

function record(id: string) {
  return {
    id,
    displayName: id,
    updatedAt: new Date("2026-01-01"),
    values: [],
  };
}

function field(id: string, overrides: Record<string, unknown> = {}) {
  const base: {
    id: string;
    entityTypeId: string;
    name: string;
    key: string;
    description: string | null;
    type: EntityFieldType;
    required: boolean;
    isUnique: boolean;
    searchable: boolean;
    multiple: boolean;
    sortOrder: number;
    config: Prisma.JsonValue | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    options: Array<{
      id: string;
      label: string;
      value: string;
      sortOrder: number;
      isActive: boolean;
    }>;
  } = {
    id,
    entityTypeId: "entity_1",
    name: id,
    key: id,
    description: null,
    type: "TEXT",
    required: false,
    isUnique: false,
    searchable: true,
    multiple: false,
    sortOrder: 0,
    config: null,
    isActive: true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    options: [],
  };

  return {
    ...base,
    ...overrides,
  };
}
