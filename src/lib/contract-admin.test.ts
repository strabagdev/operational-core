import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  archiveContractForAdmin,
  ContractAdminError,
  createContractForAdmin,
  deleteContractForAdmin,
  getContractAdministration,
  restoreContractForAdmin,
  updateContractForAdmin,
} from "./contract-admin";
import { deleteContractConfirmationText } from "./contract-deletion";
import { prisma } from "./prisma";

vi.mock("./prisma", () => ({
  prisma: {
    organization: {
      findMany: vi.fn(),
    },
    contract: {
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const organizationFindMany = vi.mocked(prisma.organization.findMany);
const contractFindFirst = vi.mocked(prisma.contract.findFirst);
const contractFindMany = vi.mocked(prisma.contract.findMany);
const transaction = vi.mocked(prisma.$transaction);

function organization(overrides: Record<string, unknown> = {}) {
  return {
    id: "org_1",
    name: "Demo Organization",
    slug: "demo",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function contract(overrides: Record<string, unknown> = {}) {
  return {
    id: "contract_1",
    organizationId: "org_1",
    name: "Demo Contract",
    code: "DEMO-001",
    description: null,
    slug: "demo-contract",
    status: "ACTIVE",
    organization: organization(),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function tx() {
  return {
    auditChange: {
      deleteMany: vi.fn(async () => ({ count: 2 })),
    },
    auditEvent: {
      create: vi.fn(async ({ data }) => data),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    contract: {
      create: vi.fn(async ({ data }) => contract({ ...data, id: "new_contract" })),
      delete: vi.fn(async ({ where }) => contract({ id: where.id, status: "ARCHIVED" })),
      update: vi.fn(async ({ data }) => contract({ ...data })),
      findFirst: vi.fn<() => Promise<unknown>>(async () => null),
    },
    entityField: {
      deleteMany: vi.fn(async () => ({ count: 4 })),
    },
    entityRelation: {
      deleteMany: vi.fn(async () => ({ count: 3 })),
    },
    entityRecord: {
      deleteMany: vi.fn(async () => ({ count: 5 })),
    },
    entityType: {
      deleteMany: vi.fn(async () => ({ count: 2 })),
    },
    entityValue: {
      deleteMany: vi.fn(async () => ({ count: 8 })),
    },
    fieldOption: {
      deleteMany: vi.fn(async () => ({ count: 6 })),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  organizationFindMany.mockResolvedValue([organization()] as never);
  contractFindFirst.mockResolvedValue(null);
  contractFindMany.mockResolvedValue([] as never);
  transaction.mockImplementation(async (callback) => callback(tx() as never));
});

describe("contract administration", () => {
  it("creates a contract in an authorized organization and audits it in the transaction", async () => {
    const currentTx = tx();
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    const result = await createContractForAdmin("user_1", {
      name: "  Nuevo contrato  ",
      code: "  NEW-001  ",
      status: "ACTIVE",
    });

    expect(result).toMatchObject({ name: "Nuevo contrato", code: "NEW-001" });
    expect(currentTx.contract.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org_1",
          name: "Nuevo contrato",
          code: "NEW-001",
          status: "ACTIVE",
        }),
      }),
    );
    expect(currentTx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CONTRACT_CREATED" }),
      }),
    );
  });

  it("rejects duplicate code in the same organization", async () => {
    contractFindFirst.mockResolvedValueOnce({ id: "existing" } as never);

    await expect(
      createContractForAdmin("user_1", {
        name: "Nuevo",
        code: "DEMO-001",
        status: "ACTIVE",
      }),
    ).rejects.toThrow(ContractAdminError);
  });

  it("allows the same code in another authorized organization", async () => {
    organizationFindMany.mockResolvedValue([
      organization({ id: "org_1" }),
      organization({ id: "org_2", name: "Otra Organización" }),
    ] as never);
    const currentTx = tx();
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await createContractForAdmin("user_1", {
      name: "Nuevo",
      code: "DEMO-001",
      status: "ACTIVE",
      organizationId: "org_2",
    });

    expect(contractFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org_2", code: "DEMO-001" }),
      }),
    );
    expect(currentTx.contract.create).toHaveBeenCalled();
  });

  it("updates a contract without moving it between organizations", async () => {
    contractFindFirst
      .mockResolvedValueOnce(contract() as never)
      .mockResolvedValueOnce(null);
    const currentTx = tx();
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await updateContractForAdmin("user_1", "contract_1", {
      name: "Contrato editado",
      code: "EDIT-001",
      status: "INACTIVE",
      organizationId: "org_2",
    });

    expect(currentTx.contract.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "contract_1" },
        data: {
          name: "Contrato editado",
          code: "EDIT-001",
          status: "INACTIVE",
        },
      }),
    );
    expect(currentTx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CONTRACT_UPDATED" }),
      }),
    );
    expect(currentTx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CONTRACT_STATUS_CHANGED" }),
      }),
    );
  });

  it("archives and restores contracts with audit events", async () => {
    const archiveTx = tx();
    contractFindFirst.mockResolvedValueOnce(contract() as never);
    transaction.mockImplementationOnce(async (callback) => callback(archiveTx as never));

    await archiveContractForAdmin("user_1", "contract_1");

    expect(archiveTx.contract.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "ARCHIVED" } }),
    );
    expect(archiveTx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CONTRACT_ARCHIVED" }),
      }),
    );

    const restoreTx = tx();
    contractFindFirst.mockResolvedValueOnce(contract({ status: "ARCHIVED" }) as never);
    transaction.mockImplementationOnce(async (callback) => callback(restoreTx as never));

    await restoreContractForAdmin("user_1", "contract_1");

    expect(restoreTx.contract.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "ACTIVE" } }),
    );
    expect(restoreTx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CONTRACT_RESTORED" }),
      }),
    );
  });

  it("rejects contracts or organizations outside the admin memberships", async () => {
    organizationFindMany.mockResolvedValueOnce([organization({ id: "org_1" })] as never);

    await expect(
      createContractForAdmin("user_1", {
        name: "Ajeno",
        code: "EXT",
        status: "ACTIVE",
        organizationId: "org_2",
      }),
    ).rejects.toThrow("La organización no está disponible");

    contractFindFirst.mockResolvedValueOnce(null);
    await expect(archiveContractForAdmin("user_1", "foreign_contract")).resolves.toBeNull();
  });

  it("rejects ACTIVE contracts on physical deletion", async () => {
    const currentTx = tx();
    currentTx.contract.findFirst.mockResolvedValueOnce(contract({ status: "ACTIVE" }));
    transaction.mockImplementationOnce(async (callback) => callback(currentTx as never));

    await expect(
      deleteContractForAdmin("user_1", "contract_1", "ELIMINAR DEMO-001"),
    ).rejects.toThrow("Solo puedes eliminar contratos archivados.");
    expect(currentTx.contract.delete).not.toHaveBeenCalled();
  });

  it("rejects INACTIVE contracts on physical deletion", async () => {
    const currentTx = tx();
    currentTx.contract.findFirst.mockResolvedValueOnce(contract({ status: "INACTIVE" }));
    transaction.mockImplementationOnce(async (callback) => callback(currentTx as never));

    await expect(
      deleteContractForAdmin("user_1", "contract_1", "ELIMINAR DEMO-001"),
    ).rejects.toThrow("Solo puedes eliminar contratos archivados.");
    expect(currentTx.contract.delete).not.toHaveBeenCalled();
  });

  it("rejects incorrect confirmation text with exact comparison", async () => {
    const currentTx = tx();
    currentTx.contract.findFirst.mockResolvedValueOnce(contract({ status: "ARCHIVED" }));
    transaction.mockImplementationOnce(async (callback) => callback(currentTx as never));

    await expect(
      deleteContractForAdmin("user_1", "contract_1", "eliminar DEMO-001"),
    ).rejects.toThrow("La confirmación no coincide.");
    expect(currentTx.contract.delete).not.toHaveBeenCalled();
  });

  it("accepts exact confirmation text with exterior trim", async () => {
    const currentTx = tx();
    currentTx.contract.findFirst.mockResolvedValueOnce(contract({ status: "ARCHIVED" }));
    transaction.mockImplementationOnce(async (callback) => callback(currentTx as never));

    await expect(
      deleteContractForAdmin("user_1", "contract_1", "  ELIMINAR DEMO-001  "),
    ).resolves.toMatchObject({
      id: "contract_1",
    });

    expect(currentTx.contract.delete).toHaveBeenCalledWith({ where: { id: "contract_1" } });
  });

  it("rejects foreign contracts and users without admin permission", async () => {
    const currentTx = tx();
    currentTx.contract.findFirst.mockResolvedValueOnce(null);
    transaction.mockImplementationOnce(async (callback) => callback(currentTx as never));

    await expect(
      deleteContractForAdmin("user_1", "foreign_contract", "ELIMINAR DEMO-001"),
    ).resolves.toBeNull();
    expect(currentTx.contract.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "foreign_contract",
          organization: {
            memberships: {
              some: {
                userId: "user_1",
                role: "ADMIN",
              },
            },
          },
        }),
      }),
    );
    expect(currentTx.contract.delete).not.toHaveBeenCalled();
  });

  it("deletes dependent data and contractual audit before the contract", async () => {
    const currentTx = tx();
    currentTx.contract.findFirst.mockResolvedValueOnce(contract({ status: "ARCHIVED" }));
    transaction.mockImplementationOnce(async (callback) => callback(currentTx as never));

    await deleteContractForAdmin("user_1", "contract_1", deleteContractConfirmationText("DEMO-001"));

    expect(currentTx.auditChange.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { auditEvent: { contractId: "contract_1" } },
            { entityField: { entityType: { contractId: "contract_1" } } },
          ]),
        }),
      }),
    );
    expect(currentTx.auditEvent.deleteMany).toHaveBeenCalledWith({
      where: { contractId: "contract_1" },
    });
    expect(currentTx.entityRelation.deleteMany).toHaveBeenCalled();
    expect(currentTx.entityValue.deleteMany).toHaveBeenCalled();
    expect(currentTx.entityRecord.deleteMany).toHaveBeenCalled();
    expect(currentTx.fieldOption.deleteMany).toHaveBeenCalled();
    expect(currentTx.entityField.deleteMany).toHaveBeenCalled();
    expect(currentTx.entityType.deleteMany).toHaveBeenCalled();
    expect(currentTx.contract.delete).toHaveBeenCalledWith({ where: { id: "contract_1" } });
  });

  it("uses a single transaction and propagates failures so Prisma can roll back", async () => {
    const currentTx = tx();
    currentTx.contract.findFirst.mockResolvedValueOnce(contract({ status: "ARCHIVED" }));
    currentTx.entityValue.deleteMany.mockRejectedValueOnce(new Error("delete failed"));
    transaction.mockImplementationOnce(async (callback) => callback(currentTx as never));

    await expect(
      deleteContractForAdmin("user_1", "contract_1", "ELIMINAR DEMO-001"),
    ).rejects.toThrow("delete failed");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(currentTx.contract.delete).not.toHaveBeenCalled();
  });

  it("omits a deleted contract from the administration listing returned by Prisma", async () => {
    organizationFindMany.mockResolvedValueOnce([organization()] as never);
    contractFindMany.mockResolvedValueOnce([
      contract({ id: "contract_2", code: "OTHER-001", status: "ARCHIVED" }),
    ] as never);

    const result = await getContractAdministration({ userId: "user_1", status: "ALL" });

    expect(result.contracts).toHaveLength(1);
    expect(result.contracts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "contract_1" })]),
    );
  });
});
