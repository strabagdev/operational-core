import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteUnusedEntityField,
  getEntityFieldDeletionSafety,
  getEntityFieldDeletionSafetyFromCounts,
} from "./entity-config";
import { prisma } from "./prisma";

const mocks = vi.hoisted(() => ({
  getAuthorizedContract: vi.fn(),
}));

vi.mock("./contracts", () => ({
  getAuthorizedContract: mocks.getAuthorizedContract,
}));

vi.mock("./prisma", () => ({
  prisma: {
    entityType: {
      findFirst: vi.fn(),
    },
    entityValue: {
      count: vi.fn(),
    },
    entityRelation: {
      count: vi.fn(),
    },
    auditChange: {
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const entityTypeFindFirst = vi.mocked(prisma.entityType.findFirst);
const entityValueCount = vi.mocked(prisma.entityValue.count);
const entityRelationCount = vi.mocked(prisma.entityRelation.count);
const auditChangeCount = vi.mocked(prisma.auditChange.count);
const transaction = vi.mocked(prisma.$transaction);

function contract(overrides: Record<string, unknown> = {}) {
  return {
    id: "contract_1",
    organizationId: "org_1",
    name: "Contrato",
    code: "CON",
    description: null,
    status: "ACTIVE",
    slug: "contrato",
    organization: { id: "org_1", name: "Org" },
    ...overrides,
  };
}

function entityType(overrides: Record<string, unknown> = {}) {
  return {
    id: "entity_1",
    contractId: "contract_1",
    fields: [
      {
        id: "field_1",
        name: "Serie",
        key: "serie",
        type: "TEXT",
      },
    ],
    ...overrides,
  };
}

function field(overrides: Record<string, unknown> = {}) {
  return {
    id: "field_1",
    name: "Serie",
    key: "serie",
    type: "TEXT",
    _count: {
      auditChanges: 0,
      relations: 0,
      values: 0,
    },
    ...overrides,
  };
}

function tx(fieldResult: ReturnType<typeof field> | null = field()) {
  return {
    entityField: {
      findFirst: vi.fn(async () => fieldResult),
      delete: vi.fn(async ({ where }) => ({ id: where.id })),
    },
    fieldOption: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthorizedContract.mockResolvedValue(contract());
  entityTypeFindFirst.mockResolvedValue(entityType() as never);
  entityValueCount.mockResolvedValue(0);
  entityRelationCount.mockResolvedValue(0);
  auditChangeCount.mockResolvedValue(0);
  transaction.mockImplementation(async (callback) => callback(tx() as never));
});

describe("entity field deletion safety", () => {
  it("allows a field that has never been used", () => {
    expect(
      getEntityFieldDeletionSafetyFromCounts({
        auditChanges: 0,
        relations: 0,
        values: 0,
      }),
    ).toEqual({
      canDelete: true,
      counts: { auditChanges: 0, relations: 0, values: 0 },
      reasons: [],
    });
  });

  it("blocks a field with EntityValue history", async () => {
    entityValueCount.mockResolvedValue(1);

    await expect(getEntityFieldDeletionSafety("field_1")).resolves.toMatchObject({
      canDelete: false,
      reasons: [expect.objectContaining({ code: "HAS_VALUES", count: 1 })],
    });
  });

  it("blocks a RELATION field with EntityRelation history", async () => {
    entityRelationCount.mockResolvedValue(2);

    await expect(getEntityFieldDeletionSafety("field_1")).resolves.toMatchObject({
      canDelete: false,
      reasons: [expect.objectContaining({ code: "HAS_RELATIONS", count: 2 })],
    });
  });

  it("blocks a field with audit history", async () => {
    auditChangeCount.mockResolvedValue(3);

    await expect(getEntityFieldDeletionSafety("field_1")).resolves.toMatchObject({
      canDelete: false,
      reasons: [expect.objectContaining({ code: "HAS_AUDIT_HISTORY", count: 3 })],
    });
  });
});

describe("delete unused entity field", () => {
  it("deletes a new unused field", async () => {
    const currentTx = tx();
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      deleteUnusedEntityField("contract_1", "entity_1", "field_1", "user_1"),
    ).resolves.toMatchObject({ id: "field_1" });
    expect(currentTx.fieldOption.deleteMany).toHaveBeenCalledWith({
      where: { entityFieldId: "field_1" },
    });
    expect(currentTx.entityField.delete).toHaveBeenCalledWith({
      where: { id: "field_1" },
    });
  });

  it("deletes an unused SELECT field with FieldOption rows", async () => {
    const currentTx = tx(field({ type: "SELECT" }));
    currentTx.fieldOption.deleteMany.mockResolvedValue({ count: 2 });
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      deleteUnusedEntityField("contract_1", "entity_1", "field_1", "user_1"),
    ).resolves.toMatchObject({ id: "field_1", type: "SELECT" });
    expect(currentTx.fieldOption.deleteMany).toHaveBeenCalledWith({
      where: { entityFieldId: "field_1" },
    });
    expect(currentTx.entityField.delete).toHaveBeenCalled();
  });

  it("deletes an inactive unused field", async () => {
    const currentTx = tx(field({ isActive: false }));
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      deleteUnusedEntityField("contract_1", "entity_1", "field_1", "user_1"),
    ).resolves.toMatchObject({ id: "field_1" });
    expect(currentTx.entityField.delete).toHaveBeenCalled();
  });

  it("blocks an inactive field with historical values", async () => {
    const currentTx = tx(field({
      isActive: false,
      _count: { auditChanges: 0, relations: 0, values: 1 },
    }));
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      deleteUnusedEntityField("contract_1", "entity_1", "field_1", "user_1"),
    ).rejects.toThrow("valores históricos");
    expect(currentTx.entityField.delete).not.toHaveBeenCalled();
  });

  it("blocks deletion when a relation appears before delete runs", async () => {
    const currentTx = tx(field({
      type: "RELATION",
      _count: { auditChanges: 0, relations: 1, values: 0 },
    }));
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      deleteUnusedEntityField("contract_1", "entity_1", "field_1", "user_1"),
    ).rejects.toThrow("relaciones históricas");
    expect(currentTx.fieldOption.deleteMany).not.toHaveBeenCalled();
    expect(currentTx.entityField.delete).not.toHaveBeenCalled();
  });

  it("returns null for a field from another contract or organization", async () => {
    entityTypeFindFirst.mockResolvedValue(null);

    await expect(
      deleteUnusedEntityField("contract_1", "entity_1", "field_1", "user_1"),
    ).resolves.toBeNull();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("returns null when entityTypeId is manipulated", async () => {
    const currentTx = tx(null);
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      deleteUnusedEntityField("contract_1", "entity_other", "field_1", "user_1"),
    ).resolves.toBeNull();
    expect(currentTx.entityField.delete).not.toHaveBeenCalled();
  });

  it("returns null when entityFieldId belongs to another EntityType", async () => {
    const currentTx = tx(null);
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      deleteUnusedEntityField("contract_1", "entity_1", "field_other", "user_1"),
    ).resolves.toBeNull();
    expect(currentTx.entityField.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityTypeId: "entity_1",
          id: "field_other",
        }),
      }),
    );
    expect(currentTx.entityField.delete).not.toHaveBeenCalled();
  });

  it("handles a second delete attempt without deleting anything", async () => {
    const currentTx = tx(null);
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      deleteUnusedEntityField("contract_1", "entity_1", "field_1", "user_1"),
    ).resolves.toBeNull();
    expect(currentTx.fieldOption.deleteMany).not.toHaveBeenCalled();
    expect(currentTx.entityField.delete).not.toHaveBeenCalled();
  });
});
