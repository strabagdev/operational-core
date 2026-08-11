import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteEntityRecordsPermanently,
  deleteRecordsConfirmationText,
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
    $transaction: vi.fn(),
  },
}));

const entityTypeFindFirst = vi.mocked(prisma.entityType.findFirst);
const transaction = vi.mocked(prisma.$transaction);

function entityType() {
  return {
    id: "entity_1",
    contractId: "contract_1",
    fields: [],
  };
}

function record(id: string) {
  return {
    id,
    displayName: id,
  };
}

function tx(records = [record("record_1"), record("record_2")]) {
  return {
    entityRecord: {
      findMany: vi.fn(async () => records),
      deleteMany: vi.fn(async ({ where }) => ({ count: where.id.in.length })),
    },
    auditEvent: {
      deleteMany: vi.fn(async () => ({ count: 2 })),
    },
    auditChange: {
      deleteMany: vi.fn(async () => ({ count: 4 })),
    },
    entityRelation: {
      deleteMany: vi.fn(async () => ({ count: 3 })),
    },
    entityValue: {
      deleteMany: vi.fn(async () => ({ count: 5 })),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  entityTypeFindFirst.mockResolvedValue(entityType() as never);
});

describe("bulk entity record permanent deletion", () => {
  it("requires exact confirmation text", async () => {
    await expect(
      deleteEntityRecordsPermanently(
        "contract_1",
        "entity_1",
        ["record_1", "record_2"],
        "user_1",
        "ELIMINAR 2",
      ),
    ).rejects.toThrow("La confirmación no coincide.");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("deletes dependencies and records in a safe order", async () => {
    const currentTx = tx();
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      deleteEntityRecordsPermanently(
        "contract_1",
        "entity_1",
        ["record_1", "record_2"],
        "user_1",
        deleteRecordsConfirmationText(2),
      ),
    ).resolves.toEqual({ count: 2 });

    expect(currentTx.auditChange.deleteMany).toHaveBeenCalledWith({
      where: {
        auditEvent: {
          entityRecordId: { in: ["record_1", "record_2"] },
          contractId: "contract_1",
        },
      },
    });
    expect(currentTx.auditEvent.deleteMany).toHaveBeenCalled();
    expect(currentTx.entityRelation.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { sourceRecordId: { in: ["record_1", "record_2"] } },
          { targetRecordId: { in: ["record_1", "record_2"] } },
        ],
      },
    });
    expect(currentTx.entityValue.deleteMany).toHaveBeenCalledWith({
      where: { entityRecordId: { in: ["record_1", "record_2"] } },
    });
    expect(currentTx.entityRecord.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["record_1", "record_2"] }, entityTypeId: "entity_1" },
    });
  });

  it("rejects ids from another contract or entity type", async () => {
    const currentTx = tx([record("record_1")]);
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      deleteEntityRecordsPermanently(
        "contract_1",
        "entity_1",
        ["record_1", "foreign"],
        "user_1",
        deleteRecordsConfirmationText(2),
      ),
    ).rejects.toThrow("Uno o más registros seleccionados");
    expect(currentTx.entityRecord.deleteMany).not.toHaveBeenCalled();
  });

  it("keeps deletion atomic when a dependency delete fails", async () => {
    const currentTx = tx();
    currentTx.entityValue.deleteMany.mockRejectedValueOnce(new Error("value delete failed"));
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      deleteEntityRecordsPermanently(
        "contract_1",
        "entity_1",
        ["record_1", "record_2"],
        "user_1",
        deleteRecordsConfirmationText(2),
      ),
    ).rejects.toThrow("value delete failed");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(currentTx.entityRecord.deleteMany).not.toHaveBeenCalled();
  });
});
