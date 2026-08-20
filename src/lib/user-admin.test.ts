import bcrypt from "bcrypt";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  canDeleteUser,
  createUserForAdmin,
  deleteUserForAdmin,
  getEditableUserForAdmin,
  getUserAdministration,
  isPrismaConnectivityError,
  organizationMustKeepAdminMessage,
  setUserActiveForAdmin,
  updateUserExperiencesForAdmin,
  updateUserForAdmin,
  userAdminDatabaseConnectionMessage,
  userAdminFriendlyError,
  userHasHistoryCannotDeleteMessage,
  UserAdminDatabaseConnectionError,
} from "./user-admin";
import { lastPlatformAdminMessage } from "./platform-auth";
import { prisma } from "./prisma";

vi.mock("./prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    appView: {
      findMany: vi.fn(),
    },
    auditEvent: {
      findFirst: vi.fn(),
    },
    contract: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    entityType: {
      findMany: vi.fn(),
    },
    membership: {
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    organization: {
      findMany: vi.fn(),
    },
    user: {
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    userAppViewAccess: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

const organizationFindMany = vi.mocked(prisma.organization.findMany);
const membershipFindMany = vi.mocked(prisma.membership.findMany);
const membershipFindFirst = vi.mocked(prisma.membership.findFirst);
const membershipFindUnique = vi.mocked(prisma.membership.findUnique);
const membershipCreate = vi.mocked(prisma.membership.create);
const membershipUpdate = vi.mocked(prisma.membership.update);
const userFindFirst = vi.mocked(prisma.user.findFirst);
const userFindUnique = vi.mocked(prisma.user.findUnique);
const userCreate = vi.mocked(prisma.user.create);
const userUpdate = vi.mocked(prisma.user.update);
const userDelete = vi.mocked(prisma.user.delete);
const contractFindFirst = vi.mocked(prisma.contract.findFirst);
const contractFindMany = vi.mocked(prisma.contract.findMany);
const entityTypeFindMany = vi.mocked(prisma.entityType.findMany);
const auditEventFindFirst = vi.mocked(prisma.auditEvent.findFirst);
const accessFindMany = vi.mocked(prisma.userAppViewAccess.findMany);
const accessDeleteMany = vi.mocked(prisma.userAppViewAccess.deleteMany);
const accessCreateMany = vi.mocked(prisma.userAppViewAccess.createMany);
const appViewFindMany = vi.mocked(prisma.appView.findMany);
const transaction = vi.mocked(prisma.$transaction);

const adminOrganization = { id: "org_1", name: "Empresa A" };
const baseMembership = {
  id: "membership_1",
  organization: adminOrganization,
  organizationId: "org_1",
  role: "MEMBER",
  user: {
    active: true,
    email: "user@example.com",
    id: "user_1",
    name: "User One",
    passwordHash: "hash",
  },
  userId: "user_1",
};

beforeEach(() => {
  vi.clearAllMocks();
  organizationFindMany.mockResolvedValue([adminOrganization] as never);
  transaction.mockImplementation(async (callback) => callback(prisma as never));
  userFindUnique.mockResolvedValue(null);
  userCreate.mockImplementation((async ({ data }: { data: Record<string, unknown> }) => ({
    id: "user_new",
    ...data,
  })) as never);
  userUpdate.mockImplementation((async ({
    data,
    where,
  }: {
    data: Record<string, unknown>;
    where: { id: string };
  }) => ({ id: where.id, ...data })) as never);
  userDelete.mockImplementation((async ({ where }: { where: { id: string } }) => ({
    id: where.id,
  })) as never);
  membershipCreate.mockImplementation((async ({ data }: { data: Record<string, unknown> }) => ({
    id: "membership_new",
    ...data,
  })) as never);
  membershipUpdate.mockImplementation((async ({ data }: { data: Record<string, unknown> }) => ({
    ...baseMembership,
    ...data,
  })) as never);
  membershipFindFirst.mockResolvedValue(baseMembership as never);
  membershipFindUnique.mockResolvedValue(baseMembership as never);
  membershipFindMany.mockResolvedValue([]);
  auditEventFindFirst.mockResolvedValue(null);
  contractFindFirst.mockResolvedValue({ id: "contract_1" } as never);
  appViewFindMany.mockResolvedValue([{ id: "view_1" }] as never);
  accessFindMany.mockResolvedValue([]);
  accessDeleteMany.mockResolvedValue({ count: 0 } as never);
  accessCreateMany.mockResolvedValue({ count: 1 } as never);
  contractFindMany.mockResolvedValue([]);
  entityTypeFindMany.mockResolvedValue([]);
  userFindFirst.mockResolvedValue(null);
});

describe("user administration", () => {
  it("identifies Prisma connectivity errors without treating them as authorization failures", () => {
    const connectivityError = Object.assign(
      new Error("Can't reach database server at `reseau.proxy.rlwy.net:23615`"),
      { name: "PrismaClientInitializationError" },
    );

    expect(isPrismaConnectivityError(connectivityError)).toBe(true);
    expect(userAdminFriendlyError(connectivityError)).toBe(userAdminDatabaseConnectionMessage);
  });

  it("retries the read-only admin organization lookup once for connectivity errors", async () => {
    const connectivityError = Object.assign(
      new Error("Can't reach database server at `reseau.proxy.rlwy.net:23615`"),
      { name: "PrismaClientInitializationError" },
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    organizationFindMany
      .mockRejectedValueOnce(connectivityError)
      .mockResolvedValueOnce([adminOrganization] as never);

    const result = await getUserAdministration({ userId: "admin_1" });

    expect(result.organization).toEqual(adminOrganization);
    expect(organizationFindMany).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("retrying once"),
      connectivityError,
    );

    consoleError.mockRestore();
  });

  it("surfaces persistent read connectivity as infrastructure failure", async () => {
    const connectivityError = Object.assign(
      new Error("Can't reach database server at `reseau.proxy.rlwy.net:23615`"),
      { name: "PrismaClientInitializationError" },
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    organizationFindMany.mockRejectedValue(connectivityError);

    await expect(getEditableUserForAdmin({
      adminUserId: "admin_1",
      userId: "user_1",
    })).rejects.toBeInstanceOf(UserAdminDatabaseConnectionError);
    expect(organizationFindMany).toHaveBeenCalledTimes(2);

    consoleError.mockRestore();
  });

  it("lists users with status and assigned experiences", async () => {
    membershipFindMany.mockResolvedValueOnce([
      {
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        id: "membership_1",
        role: "ADMIN",
        user: {
          active: true,
          appViewAccesses: [
            {
              appView: { name: "Registros Personas" },
              contract: { id: "contract_1", name: "Contrato A", organizationId: "org_1" },
            },
          ],
          email: "ana@example.com",
          id: "user_1",
          name: "Ana",
        },
      },
    ] as never);

    const result = await getUserAdministration({ userId: "admin_1" });

    expect(result.users).toEqual([
      expect.objectContaining({
        active: true,
        appViewAccesses: expect.arrayContaining([
          expect.objectContaining({ appView: { name: "Registros Personas" } }),
        ]),
        email: "ana@example.com",
        role: "ADMIN",
      }),
    ]);
  });

  it("creates MEMBER and ADMIN users with normalized email, active state and hashed password", async () => {
    await createUserForAdmin("admin_1", {
      active: "active",
      email: " LUIS@example.com ",
      name: "Luis",
      password: "secret123",
      role: "MEMBER",
    });

    expect(userCreate.mock.calls[0][0].data).toMatchObject({
      active: true,
      email: "luis@example.com",
      name: "Luis",
    });
    expect(userCreate.mock.calls[0][0].data.passwordHash).not.toBe("secret123");
    await expect(bcrypt.compare(
      "secret123",
      String(userCreate.mock.calls[0][0].data.passwordHash),
    )).resolves.toBe(true);
    expect(membershipCreate).toHaveBeenCalledWith({
      data: {
        organizationId: "org_1",
        role: "MEMBER",
        userId: "user_new",
      },
    });

    await createUserForAdmin("admin_1", {
      active: "inactive",
      email: "admin2@example.com",
      name: "Admin Dos",
      password: "secret456",
      role: "ADMIN",
    });

    expect(userCreate.mock.calls[1][0].data).toMatchObject({ active: false });
    expect(membershipCreate.mock.calls[1][0].data.role).toBe("ADMIN");
  });

  it("rejects duplicate emails and invalid passwords", async () => {
    userFindUnique.mockResolvedValueOnce({
      id: "user_existing",
      memberships: [{ organizationId: "org_1" }],
    } as never);

    await expect(createUserForAdmin("admin_1", {
      active: "active",
      email: "dupe@example.com",
      name: "Dupe",
      password: "secret123",
      role: "MEMBER",
    })).rejects.toThrow("El usuario ya pertenece a esta organización.");

    await expect(createUserForAdmin("admin_1", {
      active: "active",
      email: "short@example.com",
      name: "Short",
      password: "short",
      role: "MEMBER",
    })).rejects.toThrow("La contraseña debe tener al menos 8 caracteres.");
  });

  it("blocks cross-tenant creation context when the caller is not ADMIN anywhere", async () => {
    organizationFindMany.mockResolvedValueOnce([]);

    await expect(createUserForAdmin("member_1", {
      active: "active",
      email: "luis@example.com",
      name: "Luis",
      password: "secret123",
      role: "MEMBER",
    })).rejects.toThrow("No tienes permisos para administrar usuarios.");
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("edits name, email, role and status while keeping password when blank", async () => {
    await updateUserForAdmin({
      adminUserId: "admin_1",
      input: {
        active: "inactive",
        email: "new@example.com",
        name: "Nuevo Nombre",
        password: "",
        role: "MEMBER",
      },
      userId: "user_1",
    });

    expect(userUpdate).toHaveBeenCalledWith({
      data: {
        active: false,
        email: "new@example.com",
        name: "Nuevo Nombre",
      },
      where: { id: "user_1" },
    });
    expect(membershipUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { role: "MEMBER" },
    }));
  });

  it("changes password only when provided", async () => {
    await updateUserForAdmin({
      adminUserId: "admin_1",
      input: {
        active: "active",
        email: "user@example.com",
        name: "User One",
        password: "changed123",
        role: "MEMBER",
      },
      userId: "user_1",
    });

    expect(userUpdate.mock.calls[0][0].data.passwordHash).toEqual(expect.any(String));
    await expect(bcrypt.compare(
      "changed123",
      String(userUpdate.mock.calls[0][0].data.passwordHash),
    )).resolves.toBe(true);
  });

  it("activates and deactivates users without deleting administrative rows", async () => {
    await setUserActiveForAdmin({ active: false, adminUserId: "admin_1", userId: "user_1" });
    await setUserActiveForAdmin({ active: true, adminUserId: "admin_1", userId: "user_1" });

    expect(userUpdate).toHaveBeenNthCalledWith(1, {
      data: { active: false },
      where: { id: "user_1" },
    });
    expect(userUpdate).toHaveBeenNthCalledWith(2, {
      data: { active: true },
      where: { id: "user_1" },
    });
    expect(prisma.membership.delete).not.toHaveBeenCalled();
  });

  it("protects the last active PLATFORM_ADMIN from deactivation and deletion", async () => {
    userFindUnique.mockResolvedValue({
      platformRole: "PLATFORM_ADMIN",
    } as never);
    userFindFirst.mockResolvedValue(null);

    await expect(setUserActiveForAdmin({
      active: false,
      adminUserId: "admin_1",
      userId: "user_1",
    })).rejects.toThrow(lastPlatformAdminMessage);

    await expect(deleteUserForAdmin({
      adminUserId: "admin_1",
      confirmationText: "Eliminar definitivamente a User One",
      userId: "user_1",
    })).rejects.toThrow(lastPlatformAdminMessage);

    expect(userUpdate).not.toHaveBeenCalledWith({
      data: { active: false },
      where: { id: "user_1" },
    });
    expect(userDelete).not.toHaveBeenCalled();
  });

  it("allows deactivating a PLATFORM_ADMIN when another active one exists", async () => {
    userFindUnique.mockResolvedValueOnce({
      platformRole: "PLATFORM_ADMIN",
    } as never);
    userFindFirst.mockResolvedValueOnce({
      id: "platform_other",
    } as never);

    await expect(setUserActiveForAdmin({
      active: false,
      adminUserId: "admin_1",
      userId: "user_1",
    })).resolves.toEqual({ active: false, id: "user_1" });
  });

  it("protects the last active ADMIN from demotion, deactivation and deletion", async () => {
    membershipFindFirst
      .mockResolvedValueOnce({ ...baseMembership, role: "ADMIN" } as never)
      .mockResolvedValueOnce(null);

    await expect(updateUserForAdmin({
      adminUserId: "admin_1",
      input: {
        active: "active",
        email: "admin@example.com",
        name: "Admin",
        password: "",
        role: "MEMBER",
      },
      userId: "user_1",
    })).rejects.toThrow(organizationMustKeepAdminMessage);

    membershipFindFirst
      .mockResolvedValueOnce({ ...baseMembership, role: "ADMIN" } as never)
      .mockResolvedValueOnce(null);

    await expect(setUserActiveForAdmin({
      active: false,
      adminUserId: "admin_1",
      userId: "user_1",
    })).rejects.toThrow(organizationMustKeepAdminMessage);

    membershipFindFirst
      .mockResolvedValueOnce({ ...baseMembership, role: "ADMIN" } as never)
      .mockResolvedValueOnce(null);

    await expect(deleteUserForAdmin({
      adminUserId: "admin_1",
      confirmationText: "Eliminar definitivamente a User One",
      userId: "user_1",
    })).rejects.toThrow(organizationMustKeepAdminMessage);
  });

  it("blocks physical deletion when the user has audit history", async () => {
    auditEventFindFirst.mockResolvedValueOnce({ id: "audit_1" } as never);

    await expect(canDeleteUser({ adminUserId: "admin_1", userId: "user_1" })).resolves.toEqual({
      canDelete: false,
      reason: userHasHistoryCannotDeleteMessage,
    });

    auditEventFindFirst.mockResolvedValueOnce({ id: "audit_1" } as never);
    await expect(deleteUserForAdmin({
      adminUserId: "admin_1",
      confirmationText: "Eliminar definitivamente a User One",
      userId: "user_1",
    })).rejects.toThrow(userHasHistoryCannotDeleteMessage);
  });

  it("deletes users without history after exact confirmation", async () => {
    await expect(deleteUserForAdmin({
      adminUserId: "admin_1",
      confirmationText: "Eliminar definitivamente a User One",
      userId: "user_1",
    })).resolves.toEqual({ id: "user_1" });

    expect(userDelete).toHaveBeenCalledWith({ where: { id: "user_1" } });
  });

  it("does not report delete success when connectivity fails before the transaction commits", async () => {
    const connectivityError = Object.assign(
      new Error("Can't reach database server at `reseau.proxy.rlwy.net:23615`"),
      { name: "PrismaClientInitializationError" },
    );

    membershipFindFirst.mockRejectedValueOnce(connectivityError);

    await expect(deleteUserForAdmin({
      adminUserId: "admin_1",
      confirmationText: "Eliminar definitivamente a User One",
      userId: "user_1",
    })).rejects.toThrow("Can't reach database server");
    expect(userDelete).not.toHaveBeenCalled();
  });


  it("lists assigned experiences in the editable detail", async () => {
    contractFindMany.mockResolvedValueOnce([
      {
        appViews: [
          {
            active: true,
            config: { entityTypeId: "entity_1" },
            icon: "users",
            id: "view_1",
            name: "Registros Personas",
            type: "RECORDS",
          },
        ],
        id: "contract_1",
        name: "Contrato A",
      },
    ] as never);
    entityTypeFindMany.mockResolvedValueOnce([
      { contractId: "contract_1", fields: [], id: "entity_1", name: "Personas" },
    ] as never);
    accessFindMany.mockResolvedValueOnce([{ appViewId: "view_1", contractId: "contract_1" }] as never);

    const result = await getEditableUserForAdmin({ adminUserId: "admin_1", userId: "user_1" });

    expect(result?.contracts[0].appViews[0]).toMatchObject({
      assigned: true,
      name: "Registros Personas",
      typeLabel: "Registros",
    });
  });

  it("adds and removes only valid AppViews from the contract organization", async () => {
    await updateUserExperiencesForAdmin({
      adminUserId: "admin_1",
      appViewIds: ["view_1"],
      contractId: "contract_1",
      targetUserId: "user_1",
    });

    expect(accessDeleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ contractId: "contract_1", userId: "user_1" }),
    }));
    expect(accessCreateMany).toHaveBeenCalledWith({
      data: [{ appViewId: "view_1", contractId: "contract_1", userId: "user_1" }],
      skipDuplicates: true,
    });
  });

  it("blocks cross-tenant experience assignment", async () => {
    membershipFindUnique.mockResolvedValueOnce(null);

    await expect(updateUserExperiencesForAdmin({
      adminUserId: "admin_1",
      appViewIds: ["view_1"],
      contractId: "contract_1",
      targetUserId: "foreign_user",
    })).rejects.toThrow("El usuario no pertenece a la organización del contrato.");
  });
});
