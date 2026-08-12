import bcrypt from "bcrypt";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addUserToOrganization,
  getUserAdministration,
  organizationMustKeepAdminMessage,
  removeMembershipForAdmin,
  updateMembershipRoleForAdmin,
  userAlreadyBelongsToAnotherOrganizationMessage,
} from "./user-admin";
import { prisma } from "./prisma";

vi.mock("./prisma", () => ({
  prisma: {
    organization: {
      findMany: vi.fn(),
    },
    membership: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const organizationFindMany = vi.mocked(prisma.organization.findMany);
const membershipFindMany = vi.mocked(prisma.membership.findMany);
const transaction = vi.mocked(prisma.$transaction);

function tx() {
  return {
    user: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }) => ({
        id: "user_new",
        ...data,
      })),
    },
    membership: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => ({
        id: "membership_1",
        organizationId: "org_1",
        role: "MEMBER",
        user: { id: "user_1", email: "user@example.com" },
        organization: { id: "org_1", name: "Empresa A" },
      })),
      create: vi.fn(async ({ data }) => ({
        id: "membership_new",
        ...data,
      })),
      update: vi.fn(async ({ data }) => ({
        id: "membership_1",
        organizationId: "org_1",
        ...data,
      })),
      delete: vi.fn(async ({ where }) => ({
        id: where.id,
        userId: "user_1",
        organizationId: "org_1",
        role: "MEMBER",
      })),
    },
  };
}

const adminOrganizations = [
  { id: "org_1", name: "Empresa A" },
  { id: "org_2", name: "Empresa B" },
];

beforeEach(() => {
  vi.clearAllMocks();
  organizationFindMany.mockResolvedValue(adminOrganizations as never);
  membershipFindMany.mockResolvedValue([]);
  transaction.mockImplementation(async (callback) => callback(tx() as never));
});

describe("user administration", () => {
  it("lists only memberships from an ADMIN organization", async () => {
    membershipFindMany.mockResolvedValueOnce([
      {
        id: "membership_1",
        organizationId: "org_1",
        role: "ADMIN",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        user: { id: "user_1", name: "Ana", email: "ana@example.com" },
      },
    ] as never);

    const result = await getUserAdministration({
      userId: "admin_1",
      organizationId: "org_1",
    });

    expect(organizationFindMany).toHaveBeenCalledWith({
      where: {
        memberships: {
          some: {
            userId: "admin_1",
            role: "ADMIN",
          },
        },
      },
      orderBy: { name: "asc" },
    });
    expect(membershipFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org_1" },
      }),
    );
    expect(result.memberships).toHaveLength(1);
  });

  it("does not list users from an organization the admin cannot manage", async () => {
    const result = await getUserAdministration({
      userId: "admin_1",
      organizationId: "org_outside",
    });

    expect(result.organization).toBeNull();
    expect(result.memberships).toEqual([]);
    expect(membershipFindMany).not.toHaveBeenCalled();
  });

  it("allows an ADMIN to create a new user with a hashed initial password", async () => {
    organizationFindMany.mockResolvedValueOnce([{ id: "org_1", name: "Empresa A" }] as never);
    const currentTx = tx();

    transaction.mockImplementationOnce(async (callback) => callback(currentTx as never));

    const result = await addUserToOrganization("admin_1", {
      name: "Luis",
      email: "luis@example.com",
      password: "secret123",
      role: "MEMBER",
      organizationId: "org_1",
    });

    expect(currentTx.user.create.mock.calls[0][0].data.passwordHash).not.toBe("secret123");
    await expect(
      bcrypt.compare("secret123", currentTx.user.create.mock.calls[0][0].data.passwordHash),
    ).resolves.toBe(true);
    expect(currentTx.membership.create).toHaveBeenCalledWith({
      data: {
        userId: "user_new",
        organizationId: "org_1",
        role: "MEMBER",
      },
    });
    expect(result.existingUser).toBe(false);
  });

  it("blocks MEMBER users from adding users", async () => {
    organizationFindMany.mockResolvedValueOnce([]);

    await expect(
      addUserToOrganization("member_1", {
        name: "Luis",
        email: "luis@example.com",
        password: "secret123",
        role: "MEMBER",
      }),
    ).rejects.toThrow("No tienes permisos para administrar usuarios.");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("adds an existing global user without changing name or password", async () => {
    organizationFindMany.mockResolvedValueOnce([{ id: "org_1", name: "Empresa A" }] as never);
    const currentTx = tx();
    const existingUser = {
      id: "user_existing",
      name: "Nombre Original",
      email: "existente@example.com",
      passwordHash: "hash_original",
    };

    currentTx.user.findUnique.mockResolvedValueOnce(existingUser as never);
    currentTx.membership.findFirst.mockResolvedValueOnce(null as never);
    transaction.mockImplementationOnce(async (callback) => callback(currentTx as never));

    const result = await addUserToOrganization("admin_1", {
      name: "Nombre Nuevo",
      email: "existente@example.com",
      password: "different123",
      role: "ADMIN",
      organizationId: "org_1",
    });

    expect(currentTx.user.create).not.toHaveBeenCalled();
    expect(currentTx.membership.create).toHaveBeenCalledWith({
      data: {
        userId: "user_existing",
        organizationId: "org_1",
        role: "ADMIN",
      },
    });
    expect(result.user.passwordHash).toBe("hash_original");
    expect(result.existingUser).toBe(true);
  });

  it("rejects users that already belong to the organization", async () => {
    organizationFindMany.mockResolvedValueOnce([{ id: "org_1", name: "Empresa A" }] as never);
    const currentTx = tx();

    currentTx.user.findUnique.mockResolvedValueOnce({ id: "user_existing" } as never);
    currentTx.membership.findFirst.mockResolvedValueOnce({
      id: "membership_existing",
      organizationId: "org_1",
    } as never);
    transaction.mockImplementationOnce(async (callback) => callback(currentTx as never));

    await expect(
      addUserToOrganization("admin_1", {
        name: "Ana",
        email: "ana@example.com",
        role: "MEMBER",
        organizationId: "org_1",
      }),
    ).rejects.toThrow("El usuario ya pertenece a esta organización.");
    expect(currentTx.membership.create).not.toHaveBeenCalled();
  });

  it("rejects existing users from another organization without creating a second membership", async () => {
    organizationFindMany.mockResolvedValueOnce([{ id: "org_1", name: "Empresa A" }] as never);
    const currentTx = tx();

    currentTx.user.findUnique.mockResolvedValueOnce({ id: "user_existing" } as never);
    currentTx.membership.findFirst.mockResolvedValueOnce({
      id: "membership_other",
      organizationId: "org_2",
    } as never);
    transaction.mockImplementationOnce(async (callback) => callback(currentTx as never));

    await expect(
      addUserToOrganization("admin_1", {
        name: "Ana",
        email: "ana@example.com",
        role: "MEMBER",
        organizationId: "org_1",
      }),
    ).rejects.toThrow(userAlreadyBelongsToAnotherOrganizationMessage);
    expect(currentTx.membership.create).not.toHaveBeenCalled();
    expect(currentTx.user.create).not.toHaveBeenCalled();
  });

  it("prevents demoting the last ADMIN", async () => {
    const currentTx = tx();

    currentTx.membership.findFirst
      .mockResolvedValueOnce({
        id: "membership_admin",
        organizationId: "org_1",
        role: "ADMIN",
        user: { id: "admin_1", email: "admin@example.com" },
        organization: { id: "org_1", name: "Empresa A" },
      } as never)
      .mockResolvedValueOnce(null as never);
    transaction.mockImplementationOnce(async (callback) => callback(currentTx as never));

    await expect(
      updateMembershipRoleForAdmin({
        adminUserId: "admin_1",
        membershipId: "membership_admin",
        role: "MEMBER",
      }),
    ).rejects.toThrow(organizationMustKeepAdminMessage);
    expect(currentTx.membership.update).not.toHaveBeenCalled();
  });

  it("allows promoting MEMBER to ADMIN", async () => {
    const currentTx = tx();

    transaction.mockImplementationOnce(async (callback) => callback(currentTx as never));

    await expect(
      updateMembershipRoleForAdmin({
        adminUserId: "admin_1",
        membershipId: "membership_1",
        role: "ADMIN",
      }),
    ).resolves.toMatchObject({ role: "ADMIN" });
    expect(currentTx.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "membership_1" },
        data: { role: "ADMIN" },
      }),
    );
  });

  it("prevents removing the last ADMIN", async () => {
    const currentTx = tx();

    currentTx.membership.findFirst
      .mockResolvedValueOnce({
        id: "membership_admin",
        organizationId: "org_1",
        role: "ADMIN",
        user: { id: "admin_1", email: "admin@example.com" },
        organization: { id: "org_1", name: "Empresa A" },
      } as never)
      .mockResolvedValueOnce(null as never);
    transaction.mockImplementationOnce(async (callback) => callback(currentTx as never));

    await expect(
      removeMembershipForAdmin({
        adminUserId: "admin_1",
        membershipId: "membership_admin",
      }),
    ).rejects.toThrow(organizationMustKeepAdminMessage);
    expect(currentTx.membership.delete).not.toHaveBeenCalled();
  });

  it("removes membership without deleting the global user", async () => {
    const currentTx = tx();

    transaction.mockImplementationOnce(async (callback) => callback(currentTx as never));

    await expect(
      removeMembershipForAdmin({
        adminUserId: "admin_1",
        membershipId: "membership_1",
      }),
    ).resolves.toMatchObject({ id: "membership_1" });
    expect(currentTx.membership.delete).toHaveBeenCalledWith({
      where: { id: "membership_1" },
    });
    expect(currentTx.user).not.toHaveProperty("delete");
  });
});
