import bcrypt from "bcrypt";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createOrganizationWithInitialAdmin,
  existingOrganizationAdminEmailMessage,
  getCreateOrganizationFormInput,
  getPlatformOrganization,
  getPlatformOrganizations,
  platformOrganizationAdminFriendlyError,
  setOrganizationActive,
  updateOrganization,
} from "./platform-organization-admin";
import { prisma } from "./prisma";

vi.mock("./prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    membership: {
      create: vi.fn(),
    },
    organization: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

const transaction = vi.mocked(prisma.$transaction);
const membershipCreate = vi.mocked(prisma.membership.create);
const organizationCreate = vi.mocked(prisma.organization.create);
const organizationFindMany = vi.mocked(prisma.organization.findMany);
const organizationFindUnique = vi.mocked(prisma.organization.findUnique);
const organizationUpdate = vi.mocked(prisma.organization.update);
const userCreate = vi.mocked(prisma.user.create);
const userFindUnique = vi.mocked(prisma.user.findUnique);

const platformUser = {
  active: true,
  email: "platform@example.com",
  id: "platform_1",
  name: "Platform Admin",
  platformRole: "PLATFORM_ADMIN",
};

function tx() {
  return {
    membership: {
      create: vi.fn(async ({ data }) => ({ id: "membership_new", ...data })),
    },
    organization: {
      create: vi.fn(async ({ data }) => ({
        createdAt: new Date("2026-01-01"),
        id: "org_new",
        updatedAt: new Date("2026-01-01"),
        ...data,
      })),
    },
    user: {
      create: vi.fn(async ({ data }) => ({
        createdAt: new Date("2026-01-01"),
        id: "user_new",
        updatedAt: new Date("2026-01-01"),
        ...data,
      })),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  userFindUnique.mockResolvedValue(platformUser as never);
  organizationFindUnique.mockResolvedValue(null);
  organizationFindMany.mockResolvedValue([]);
  organizationUpdate.mockImplementation((async ({
    data,
    where,
  }: {
    data: Record<string, unknown>;
    where: { id: string };
  }) => ({ id: where.id, ...data })) as never);
  transaction.mockImplementation(async (callback) => callback(prisma as never));
});

describe("platform organization administration", () => {
  it("normalizes create form input", () => {
    const formData = new FormData();

    formData.set("name", " STRABAG Chile ");
    formData.set("slug", " STRABAG Chile ");
    formData.set("adminName", " Admin Uno ");
    formData.set("adminEmail", " ADMIN@EXAMPLE.COM ");
    formData.set("adminPassword", "secret123");

    expect(getCreateOrganizationFormInput(formData)).toMatchObject({
      adminEmail: "admin@example.com",
      adminName: "Admin Uno",
      name: "STRABAG Chile",
      slug: "strabag-chile",
    });
  });

  it("lists organizations with counts and admins for platform admins", async () => {
    organizationFindMany.mockResolvedValueOnce([
      {
        _count: {
          contracts: 2,
          externalApps: 1,
          memberships: 3,
        },
        active: true,
        createdAt: new Date("2026-01-01"),
        id: "org_1",
        memberships: [
          {
            user: {
              active: true,
              email: "admin@example.com",
              id: "user_1",
              name: "Admin",
            },
          },
        ],
        name: "Empresa A",
        slug: "empresa-a",
        updatedAt: new Date("2026-01-02"),
      },
    ] as never);

    await expect(getPlatformOrganizations("platform_1")).resolves.toEqual([
      expect.objectContaining({
        active: true,
        adminUsers: [expect.objectContaining({ email: "admin@example.com" })],
        contractCount: 2,
        externalAppCount: 1,
        membershipCount: 3,
        slug: "empresa-a",
      }),
    ]);
  });

  it("keeps platform organization access independent from inactive organizations", async () => {
    organizationFindMany.mockResolvedValueOnce([
      {
        _count: {
          contracts: 0,
          externalApps: 0,
          memberships: 1,
        },
        active: false,
        createdAt: new Date("2026-01-01"),
        id: "org_inactive",
        memberships: [],
        name: "Inactive Org",
        slug: "inactive-org",
        updatedAt: new Date("2026-01-02"),
      },
    ] as never);

    await expect(getPlatformOrganizations("platform_1")).resolves.toEqual([
      expect.objectContaining({
        active: false,
        name: "Inactive Org",
        slug: "inactive-org",
      }),
    ]);
  });

  it("rejects organization admins and members without platform role", async () => {
    userFindUnique.mockResolvedValueOnce({
      ...platformUser,
      platformRole: "NONE",
    } as never);

    await expect(getPlatformOrganizations("org_admin")).rejects.toThrow(
      "No tienes permisos de administración global.",
    );

    userFindUnique.mockResolvedValueOnce({
      ...platformUser,
      platformRole: "NONE",
    } as never);

    await expect(getPlatformOrganization("member_1", "org_1")).rejects.toThrow(
      "No tienes permisos de administración global.",
    );
  });

  it("creates organization, initial user, and ADMIN membership in one transaction", async () => {
    const currentTx = tx();

    userFindUnique
      .mockResolvedValueOnce(platformUser as never)
      .mockResolvedValueOnce(null);
    transaction.mockImplementationOnce(async (callback) => callback(currentTx as never));

    const result = await createOrganizationWithInitialAdmin("platform_1", {
      adminEmail: "admin@example.com",
      adminName: "Admin Uno",
      adminPassword: "secret123",
      name: "Empresa A",
      slug: "empresa-a",
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(currentTx.organization.create).toHaveBeenCalledWith({
      data: {
        active: true,
        name: "Empresa A",
        slug: "empresa-a",
      },
    });
    expect(currentTx.user.create.mock.calls[0][0].data).toMatchObject({
      active: true,
      email: "admin@example.com",
      name: "Admin Uno",
      platformRole: "NONE",
    });
    await expect(
      bcrypt.compare("secret123", currentTx.user.create.mock.calls[0][0].data.passwordHash),
    ).resolves.toBe(true);
    expect(currentTx.membership.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org_new",
        role: "ADMIN",
        userId: "user_new",
      },
    });
    expect(result.organization.active).toBe(true);
    expect(result.membership.role).toBe("ADMIN");
  });

  it("does not leave partial data when the transaction fails", async () => {
    const currentTx = tx();

    userFindUnique
      .mockResolvedValueOnce(platformUser as never)
      .mockResolvedValueOnce(null);
    currentTx.membership.create.mockRejectedValueOnce(new Error("membership failed"));
    transaction.mockImplementationOnce(async (callback) => callback(currentTx as never));

    await expect(createOrganizationWithInitialAdmin("platform_1", {
      adminEmail: "admin@example.com",
      adminName: "Admin Uno",
      adminPassword: "secret123",
      name: "Empresa A",
      slug: "empresa-a",
    })).rejects.toThrow("membership failed");
    expect(organizationCreate).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
    expect(membershipCreate).not.toHaveBeenCalled();
  });

  it("rejects duplicate initial admin email", async () => {
    userFindUnique
      .mockResolvedValueOnce(platformUser as never)
      .mockResolvedValueOnce({ id: "existing_user" } as never);

    await expect(createOrganizationWithInitialAdmin("platform_1", {
      adminEmail: "existing@example.com",
      adminName: "Admin Uno",
      adminPassword: "secret123",
      name: "Empresa A",
      slug: "empresa-a",
    })).rejects.toThrow(existingOrganizationAdminEmailMessage);
  });

  it("rejects duplicate organization slugs on create and update", async () => {
    organizationFindUnique.mockResolvedValue({ id: "org_existing" } as never);

    await expect(createOrganizationWithInitialAdmin("platform_1", {
      adminEmail: "admin@example.com",
      adminName: "Admin Uno",
      adminPassword: "secret123",
      name: "Empresa A",
      slug: "empresa-a",
    })).rejects.toThrow("Ya existe una organización con ese slug.");

    await expect(updateOrganization("platform_1", "org_1", {
      name: "Empresa A",
      slug: "empresa-a",
    })).rejects.toThrow("Ya existe una organización con ese slug.");
  });

  it("edits organization name and slug without changing id", async () => {
    organizationFindUnique
      .mockResolvedValueOnce({ id: "org_1" } as never)
      .mockResolvedValueOnce({ id: "org_1" } as never);

    await updateOrganization("platform_1", "org_1", {
      name: "Empresa Nueva",
      slug: "empresa-nueva",
    });

    expect(organizationUpdate).toHaveBeenCalledWith({
      data: {
        name: "Empresa Nueva",
        slug: "empresa-nueva",
      },
      where: { id: "org_1" },
    });
  });

  it("deactivates and reactivates organizations without deleting related data", async () => {
    organizationFindUnique.mockResolvedValue({
      active: true,
      id: "org_1",
    } as never);

    await setOrganizationActive("platform_1", "org_1", false);

    expect(organizationUpdate).toHaveBeenCalledWith({
      data: { active: false },
      where: { id: "org_1" },
    });
    expect(prisma.membership.create).not.toHaveBeenCalled();

    organizationFindUnique.mockResolvedValue({
      active: false,
      id: "org_1",
    } as never);

    await setOrganizationActive("platform_1", "org_1", true);

    expect(organizationUpdate).toHaveBeenCalledWith({
      data: { active: true },
      where: { id: "org_1" },
    });
  });

  it("maps duplicate slug errors to friendly messages", () => {
    expect(platformOrganizationAdminFriendlyError(new Error("x"))).toBe(
      "No se pudo completar la operación.",
    );
  });
});
