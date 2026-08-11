import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteUnusedFieldOption,
  getFieldOptionUsage,
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
    fieldOption: {
      findUnique: vi.fn(),
    },
    entityValue: {
      count: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

const entityTypeFindFirst = vi.mocked(prisma.entityType.findFirst);
const fieldOptionFindUnique = vi.mocked(prisma.fieldOption.findUnique);
const entityValueCount = vi.mocked(prisma.entityValue.count);
const queryRaw = vi.mocked(prisma.$queryRaw);
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

function optionField(type: "SELECT" | "MULTISELECT" = "SELECT") {
  return {
    id: "field_1",
    type,
    options: [
      {
        id: "opt_operativo",
        entityFieldId: "field_1",
        label: "Operativo",
        value: "operativo",
        sortOrder: 1,
        isActive: true,
      },
    ],
  };
}

function entityType(type: "SELECT" | "MULTISELECT" = "SELECT") {
  return {
    id: "entity_1",
    contractId: "contract_1",
    fields: [optionField(type)],
  };
}

function tx(type: "SELECT" | "MULTISELECT", usageCount: number) {
  return {
    fieldOption: {
      findFirst: vi.fn(async () => ({
        id: "opt_operativo",
        entityFieldId: "field_1",
        label: "Operativo",
        value: "operativo",
        sortOrder: 1,
        isActive: true,
        entityField: { id: "field_1", type },
      })),
      delete: vi.fn(async () => ({ id: "opt_operativo" })),
    },
    entityValue: {
      count: vi.fn(async () => usageCount),
    },
    $queryRaw: vi.fn(async () => [{ count: BigInt(usageCount) }]),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthorizedContract.mockResolvedValue(contract());
  entityTypeFindFirst.mockResolvedValue(entityType() as never);
  transaction.mockImplementation(async (callback) => callback(tx("SELECT", 0) as never));
});

describe("field option usage", () => {
  it("detects SELECT usage through EntityValue.textValue", async () => {
    fieldOptionFindUnique.mockResolvedValue({
      id: "opt_operativo",
      entityFieldId: "field_1",
      label: "Operativo",
      value: "operativo",
      sortOrder: 1,
      isActive: true,
      entityField: { id: "field_1", type: "SELECT" },
    } as never);
    entityValueCount.mockResolvedValue(12);

    await expect(getFieldOptionUsage("opt_operativo")).resolves.toEqual({
      isUsed: true,
      usageCount: 12,
    });
    expect(entityValueCount).toHaveBeenCalledWith({
      where: { entityFieldId: "field_1", textValue: "operativo" },
    });
  });

  it("detects MULTISELECT usage inside the EntityValue.jsonValue array", async () => {
    fieldOptionFindUnique.mockResolvedValue({
      id: "opt_operativo",
      entityFieldId: "field_1",
      label: "Operativo",
      value: "operativo",
      sortOrder: 1,
      isActive: true,
      entityField: { id: "field_1", type: "MULTISELECT" },
    } as never);
    queryRaw.mockResolvedValue([{ count: BigInt(3) }] as never);

    await expect(getFieldOptionUsage("opt_operativo")).resolves.toEqual({
      isUsed: true,
      usageCount: 3,
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("deletes an unused SELECT option", async () => {
    const currentTx = tx("SELECT", 0);
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      deleteUnusedFieldOption(
        "contract_1",
        "entity_1",
        "field_1",
        "opt_operativo",
        "user_1",
      ),
    ).resolves.toBe(true);
    expect(currentTx.fieldOption.delete).toHaveBeenCalledWith({
      where: { id: "opt_operativo" },
    });
  });

  it("blocks a used SELECT option", async () => {
    const currentTx = tx("SELECT", 1);
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      deleteUnusedFieldOption(
        "contract_1",
        "entity_1",
        "field_1",
        "opt_operativo",
        "user_1",
      ),
    ).rejects.toThrow("No puedes eliminar esta opción porque está siendo utilizada");
    expect(currentTx.fieldOption.delete).not.toHaveBeenCalled();
  });

  it("deletes an unused MULTISELECT option", async () => {
    entityTypeFindFirst.mockResolvedValue(entityType("MULTISELECT") as never);
    const currentTx = tx("MULTISELECT", 0);
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      deleteUnusedFieldOption(
        "contract_1",
        "entity_1",
        "field_1",
        "opt_operativo",
        "user_1",
      ),
    ).resolves.toBe(true);
    expect(currentTx.fieldOption.delete).toHaveBeenCalledWith({
      where: { id: "opt_operativo" },
    });
  });

  it("blocks a MULTISELECT option used inside the array", async () => {
    entityTypeFindFirst.mockResolvedValue(entityType("MULTISELECT") as never);
    const currentTx = tx("MULTISELECT", 2);
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      deleteUnusedFieldOption(
        "contract_1",
        "entity_1",
        "field_1",
        "opt_operativo",
        "user_1",
      ),
    ).rejects.toThrow("No puedes eliminar esta opción porque está siendo utilizada");
    expect(currentTx.fieldOption.delete).not.toHaveBeenCalled();
  });

  it("rejects an option from another field", async () => {
    await expect(
      deleteUnusedFieldOption(
        "contract_1",
        "entity_1",
        "field_1",
        "opt_other_field",
        "user_1",
      ),
    ).resolves.toBeNull();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects an option from another contract", async () => {
    entityTypeFindFirst.mockResolvedValue(null);

    await expect(
      deleteUnusedFieldOption(
        "contract_1",
        "entity_1",
        "field_1",
        "opt_operativo",
        "user_1",
      ),
    ).resolves.toBeNull();
    expect(transaction).not.toHaveBeenCalled();
  });
});
