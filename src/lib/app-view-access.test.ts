import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  appViewAccessFriendlyError,
  getEffectiveAppViewsForUserContract,
  getAppViewAccessAdminData,
  updateUserAppViewAccess,
  userCanAccessAppView,
} from "./app-view-access";
import { prisma } from "./prisma";

vi.mock("./prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    appView: {
      findMany: vi.fn(),
    },
    contract: {
      findFirst: vi.fn(),
    },
    entityType: {
      findMany: vi.fn(),
    },
    membership: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    userAppViewAccess: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

const transaction = vi.mocked(prisma.$transaction);
const appViewFindMany = vi.mocked(prisma.appView.findMany);
const contractFindFirst = vi.mocked(prisma.contract.findFirst);
const entityTypeFindMany = vi.mocked(prisma.entityType.findMany);
const membershipFindMany = vi.mocked(prisma.membership.findMany);
const membershipFindUnique = vi.mocked(prisma.membership.findUnique);
const accessCreateMany = vi.mocked(prisma.userAppViewAccess.createMany);
const accessDeleteMany = vi.mocked(prisma.userAppViewAccess.deleteMany);
const accessFindMany = vi.mocked(prisma.userAppViewAccess.findMany);
const accessFindUnique = vi.mocked(prisma.userAppViewAccess.findUnique);

function appView(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    config: { entityTypeId: "entity_1" },
    contractId: "contract_1",
    icon: "package",
    id: "view_1",
    name: "Materiales",
    slug: "materiales",
    sortOrder: 1,
    type: "RECORDS",
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation((async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma)) as never);
  contractFindFirst.mockResolvedValue({
    id: "contract_1",
    name: "Contrato",
    organizationId: "org_1",
  } as never);
  membershipFindUnique.mockResolvedValue({ role: "ADMIN", userId: "user_1" } as never);
  membershipFindMany.mockResolvedValue([
    {
      role: "ADMIN",
      user: { email: "admin@example.com", id: "admin_1", name: "Admin" },
    },
    {
      role: "MEMBER",
      user: { email: "user@example.com", id: "user_1", name: "User" },
    },
  ] as never);
  appViewFindMany.mockResolvedValue([appView()] as never);
  entityTypeFindMany.mockResolvedValue([
    { fields: [], id: "entity_1", name: "Materiales" },
  ] as never);
  accessFindMany.mockResolvedValue([] as never);
  accessFindUnique.mockResolvedValue({ id: "access_1" } as never);
  accessCreateMany.mockResolvedValue({ count: 1 } as never);
  accessDeleteMany.mockResolvedValue({ count: 0 } as never);
});

describe("UserAppViewAccess administration", () => {
  it("lists users, views and current assignments for contract admins", async () => {
    accessFindMany.mockResolvedValueOnce([{ appViewId: "view_1" }] as never);

    const data = await getAppViewAccessAdminData({
      adminUserId: "admin_1",
      contractId: "contract_1",
      selectedUserId: "user_1",
    });

    expect(data?.assignedAppViewIds.has("view_1")).toBe(true);
    expect(data?.appViews[0]).toMatchObject({
      active: true,
      id: "view_1",
      typeLabel: "Registros",
    });
  });

  it("creates a valid assignment", async () => {
    await updateUserAppViewAccess({
      adminUserId: "admin_1",
      input: {
        appViewIds: ["view_1"],
        contractId: "contract_1",
        targetUserId: "user_1",
      },
    });

    expect(accessDeleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ contractId: "contract_1", userId: "user_1" }),
    }));
    expect(accessCreateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [
        { appViewId: "view_1", contractId: "contract_1", userId: "user_1" },
      ],
      skipDuplicates: true,
    }));
  });

  it("rejects assignments when the target user belongs to another organization", async () => {
    membershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" } as never)
      .mockResolvedValueOnce(null);

    await expect(
      updateUserAppViewAccess({
        adminUserId: "admin_1",
        input: {
          appViewIds: ["view_1"],
          contractId: "contract_1",
          targetUserId: "foreign_user",
        },
      }),
    ).rejects.toThrow("El usuario no pertenece a la organización del contrato.");
  });

  it("rejects appViews from another contract or inactive views as new assignments", async () => {
    appViewFindMany.mockResolvedValueOnce([] as never);

    await expect(
      updateUserAppViewAccess({
        adminUserId: "admin_1",
        input: {
          appViewIds: ["foreign_view"],
          contractId: "contract_1",
          targetUserId: "user_1",
        },
      }),
    ).rejects.toThrow("Una o más experiencias no pertenecen a este contrato o están inactivas.");
  });

  it("blocks non-admin users from modifying assignments", async () => {
    membershipFindUnique.mockResolvedValueOnce({ role: "MEMBER" } as never);

    await expect(
      updateUserAppViewAccess({
        adminUserId: "member_1",
        input: {
          appViewIds: ["view_1"],
          contractId: "contract_1",
          targetUserId: "user_1",
        },
      }),
    ).resolves.toBeNull();
    expect(accessCreateMany).not.toHaveBeenCalled();
  });

  it("removes active assignments when no active views are selected", async () => {
    const result = await updateUserAppViewAccess({
      adminUserId: "admin_1",
      input: {
        appViewIds: [],
        contractId: "contract_1",
        targetUserId: "user_1",
      },
    });

    expect(result).toEqual({ assignedAppViewIds: [] });
    expect(accessDeleteMany).toHaveBeenCalled();
    expect(accessCreateMany).not.toHaveBeenCalled();
  });

  it("preserves existing inactive assignments", async () => {
    accessFindMany.mockResolvedValueOnce([{ appViewId: "inactive_view" }] as never);

    await updateUserAppViewAccess({
      adminUserId: "admin_1",
      input: {
        appViewIds: ["view_1"],
        contractId: "contract_1",
        targetUserId: "user_1",
      },
    });

    expect(accessCreateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        { appViewId: "inactive_view", contractId: "contract_1", userId: "user_1" },
      ]),
    }));
  });

  it("checks whether a user can access a view", async () => {
    await expect(userCanAccessAppView({
      appViewId: "view_1",
      contractId: "contract_1",
      userId: "user_1",
    })).resolves.toBe(true);
    accessFindUnique.mockResolvedValueOnce(null);
    await expect(userCanAccessAppView({
      appViewId: "view_2",
      contractId: "contract_1",
      userId: "user_1",
    })).resolves.toBe(false);
  });

  it("lists only active AppViews assigned to a member in a contract", async () => {
    appViewFindMany.mockResolvedValueOnce([appView({ id: "assigned_view" })] as never);

    await expect(getEffectiveAppViewsForUserContract({
      contractId: "contract_1",
      userId: "member_1",
    })).resolves.toEqual([expect.objectContaining({ id: "assigned_view" })]);
    expect(appViewFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        active: true,
        contractId: "contract_1",
        userAccesses: {
          some: {
            contractId: "contract_1",
            userId: "member_1",
          },
        },
      },
    }));
  });

  it("does not list unassigned AppViews for a member", async () => {
    appViewFindMany.mockResolvedValueOnce([] as never);

    await expect(getEffectiveAppViewsForUserContract({
      contractId: "contract_1",
      userId: "member_without_access",
    })).resolves.toEqual([]);
  });

  it("surfaces duplicate assignment failures clearly", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unique failed", {
      clientVersion: "test",
      code: "P2002",
    });

    expect(appViewAccessFriendlyError(error)).toBe("La experiencia ya estaba asignada a este usuario.");
  });
});
