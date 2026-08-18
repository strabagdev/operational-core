import bcrypt from "bcrypt";
import { MembershipRole, Prisma } from "@prisma/client";
import { z } from "zod";

import { getAppViewTypeLabel, parseAppViewConfig, summarizeAppViewConfig } from "./app-views";
import { prisma } from "./prisma";

export const organizationMustKeepAdminMessage =
  "La organización debe mantener al menos un administrador.";
export const userAlreadyBelongsToAnotherOrganizationMessage =
  "Este usuario ya pertenece a otra organización.";
export const userHasHistoryCannotDeleteMessage =
  "Este usuario posee actividad histórica y no puede eliminarse. Puedes desactivarlo.";
export const userAdminDatabaseConnectionMessage =
  "No fue posible conectar con la base de datos. Intenta nuevamente.";

const prismaConnectivityErrorCodes = new Set(["P1000", "P1001", "P1002", "P1008", "P1017"]);

const roleSchema = z.enum(["ADMIN", "MEMBER"]);
const userStatusSchema = z.enum(["active", "inactive"]).default("active");
const passwordSchema = z.string().min(8, "La contraseña debe tener al menos 8 caracteres.");

export const createUserFormSchema = z.object({
  active: userStatusSchema,
  email: z.string().trim().toLowerCase().email("Ingresa un email válido."),
  name: z.string().trim().min(1, "El nombre es obligatorio."),
  password: passwordSchema,
  role: roleSchema,
});

export const updateUserFormSchema = z.object({
  active: userStatusSchema,
  email: z.string().trim().toLowerCase().email("Ingresa un email válido."),
  name: z.string().trim().min(1, "El nombre es obligatorio."),
  password: z.union([z.literal(""), passwordSchema]).optional(),
  role: roleSchema,
});

export type CreateUserFormInput = z.infer<typeof createUserFormSchema>;
export type UpdateUserFormInput = z.infer<typeof updateUserFormSchema>;

export class UserAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserAdminError";
  }
}

export class UserAdminDatabaseConnectionError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(userAdminDatabaseConnectionMessage);
    this.name = "UserAdminDatabaseConnectionError";
    this.cause = cause;
  }
}

export function getCreateUserFormInput(formData: FormData): CreateUserFormInput {
  return createUserFormSchema.parse({
    active: formData.get("active") || "active",
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
    role: formData.get("role") || "MEMBER",
  });
}

export function getUpdateUserFormInput(formData: FormData): UpdateUserFormInput {
  return updateUserFormSchema.parse({
    active: formData.get("active") || "active",
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password") ?? "",
    role: formData.get("role") || "MEMBER",
  });
}

export function getAppViewAccessInputForUser(formData: FormData) {
  return {
    appViewIds: formData
      .getAll("appViewIds")
      .map((value) => String(value).trim())
      .filter(Boolean),
    contractId: String(formData.get("contractId") ?? "").trim(),
  };
}

export function getDeleteUserConfirmation(formData: FormData) {
  return String(formData.get("confirmationText") ?? "");
}

export function userAdminFriendlyError(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Revisa los datos del usuario.";
  }

  if (error instanceof UserAdminError) {
    return error.message;
  }

  if (isUserAdminDatabaseConnectionError(error) || isPrismaConnectivityError(error)) {
    return userAdminDatabaseConnectionMessage;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return "El email ya está registrado.";
    }

    if (error.code === "P2025") {
      return "No se encontró el usuario.";
    }
  }

  return "No se pudo completar la operación.";
}

export async function getUserAdministration({ userId }: { userId: string }) {
  const organizations = await getAdminOrganizations(userId);
  const organization = resolveOrganizationFromList(organizations);

  if (!organization) {
    return { organizations, organization: null, users: [] };
  }

  const memberships = await prisma.membership.findMany({
    include: {
      user: {
        include: {
          appViewAccesses: {
            include: {
              appView: true,
              contract: true,
            },
            orderBy: [{ contract: { name: "asc" } }, { appView: { sortOrder: "asc" } }],
          },
        },
      },
    },
    orderBy: [{ role: "asc" }, { user: { name: "asc" } }, { user: { email: "asc" } }],
    where: { organizationId: organization.id },
  });

  return {
    organization,
    organizations,
    users: memberships.map((membership) => ({
      active: membership.user.active,
      appViewAccesses: membership.user.appViewAccesses.filter(
        (access) => access.contract.organizationId === organization.id,
      ),
      createdAt: membership.createdAt,
      email: membership.user.email,
      id: membership.user.id,
      membershipId: membership.id,
      name: membership.user.name,
      role: membership.role,
    })),
  };
}

export async function getEditableUserForAdmin({
  adminUserId,
  userId,
}: {
  adminUserId: string;
  userId: string;
}) {
  const organization = await resolveAdminOrganization(adminUserId);
  const membership = await prisma.membership.findUnique({
    include: { user: true },
    where: {
      userId_organizationId: {
        organizationId: organization.id,
        userId,
      },
    },
  });

  if (!membership) {
    return null;
  }

  const [contracts, accesses, entityTypes, deletion] = await Promise.all([
    prisma.contract.findMany({
      include: {
        appViews: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      where: { organizationId: organization.id },
    }),
    prisma.userAppViewAccess.findMany({
      select: {
        appViewId: true,
        contractId: true,
      },
      where: {
        contract: {
          organizationId: organization.id,
        },
        userId,
      },
    }),
    prisma.entityType.findMany({
      orderBy: { name: "asc" },
      select: {
        contractId: true,
        fields: {
          select: {
            key: true,
            name: true,
          },
        },
        id: true,
        name: true,
      },
      where: {
        contract: {
          organizationId: organization.id,
        },
      },
    }),
    canDeleteUser({ adminUserId, userId }),
  ]);
  const assignedKeys = new Set(accesses.map((access) => accessKey(access.contractId, access.appViewId)));

  return {
    canDelete: deletion.canDelete,
    contracts: contracts.map((contract) => {
      const contractEntityTypes = entityTypes.filter((entityType) => entityType.contractId === contract.id);

      return {
        appViews: contract.appViews.map((view) => {
          const config = parseAppViewConfig(view);

          return {
            active: view.active,
            assigned: assignedKeys.has(accessKey(contract.id, view.id)),
            icon: view.icon,
            id: view.id,
            name: view.name,
            summary: summarizeAppViewConfig({ config, entityTypes: contractEntityTypes }),
            typeLabel: getAppViewTypeLabel(view.type),
          };
        }),
        id: contract.id,
        name: contract.name,
      };
    }),
    deleteBlockedReason: deletion.reason,
    membership,
    organization,
  };
}

export async function createUserForAdmin(adminUserId: string, input: CreateUserFormInput) {
  input = createUserFormSchema.parse(input);
  const organization = await resolveAdminOrganization(adminUserId);
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  return prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      select: {
        id: true,
        memberships: {
          select: { organizationId: true },
        },
      },
      where: { email },
    });

    if (existingUser) {
      const existingMembership = existingUser.memberships[0];

      throw new UserAdminError(
        existingMembership?.organizationId === organization.id
          ? "El usuario ya pertenece a esta organización."
          : "El email ya está registrado.",
      );
    }

    const user = await tx.user.create({
      data: {
        active: input.active === "active",
        email,
        name,
        passwordHash: await bcrypt.hash(input.password, 12),
      },
    });
    const membership = await tx.membership.create({
      data: {
        organizationId: organization.id,
        role: input.role,
        userId: user.id,
      },
    });

    return { existingUser: false, membership, user };
  });
}

export async function updateUserForAdmin({
  adminUserId,
  input,
  userId,
}: {
  adminUserId: string;
  input: UpdateUserFormInput;
  userId: string;
}) {
  input = updateUserFormSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const membership = await getAdminMembershipByUserId(tx, adminUserId, userId);

    if (!membership) {
      return null;
    }

    if (membership.role === "ADMIN" && input.role === "MEMBER") {
      await assertOrganizationKeepsAdmin(tx, membership.organizationId, membership.id);
    }

    if (membership.role === "ADMIN" && input.active === "inactive") {
      await assertOrganizationKeepsAdmin(tx, membership.organizationId, membership.id);
    }

    const userData: Prisma.UserUpdateInput = {
      active: input.active === "active",
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
    };

    if (input.password) {
      userData.passwordHash = await bcrypt.hash(input.password, 12);
    }

    const [user, updatedMembership] = await Promise.all([
      tx.user.update({
        data: userData,
        where: { id: membership.userId },
      }),
      tx.membership.update({
        data: { role: input.role },
        include: { organization: true, user: true },
        where: { id: membership.id },
      }),
    ]);

    return { membership: updatedMembership, user };
  });
}

export async function updateMembershipRoleForAdmin({
  adminUserId,
  membershipId,
  role,
}: {
  adminUserId: string;
  membershipId: string;
  role: MembershipRole;
}) {
  return prisma.$transaction(async (tx) => {
    const membership = await getAdminMembership(tx, adminUserId, membershipId);

    if (!membership) {
      return null;
    }

    if (membership.role === role) {
      return membership;
    }

    if (membership.role === "ADMIN" && role === "MEMBER") {
      await assertOrganizationKeepsAdmin(tx, membership.organizationId, membership.id);
    }

    return tx.membership.update({
      data: { role },
      include: { organization: true, user: true },
      where: { id: membership.id },
    });
  });
}

export async function removeMembershipForAdmin({
  adminUserId,
  membershipId,
}: {
  adminUserId: string;
  membershipId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const membership = await getAdminMembership(tx, adminUserId, membershipId);

    if (!membership) {
      return null;
    }

    if (membership.role === "ADMIN") {
      await assertOrganizationKeepsAdmin(tx, membership.organizationId, membership.id);
    }

    await tx.membership.delete({ where: { id: membership.id } });

    return membership;
  });
}

export async function setUserActiveForAdmin({
  active,
  adminUserId,
  userId,
}: {
  active: boolean;
  adminUserId: string;
  userId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const membership = await getAdminMembershipByUserId(tx, adminUserId, userId);

    if (!membership) {
      return null;
    }

    if (!active && membership.role === "ADMIN") {
      await assertOrganizationKeepsAdmin(tx, membership.organizationId, membership.id);
    }

    return tx.user.update({
      data: { active },
      where: { id: membership.userId },
    });
  });
}

export async function updateUserExperiencesForAdmin({
  adminUserId,
  appViewIds,
  contractId,
  targetUserId,
}: {
  adminUserId: string;
  appViewIds: string[];
  contractId: string;
  targetUserId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const adminMembership = await tx.membership.findFirst({
      select: { organizationId: true },
      where: {
        role: "ADMIN",
        userId: adminUserId,
      },
    });

    if (!adminMembership) {
      return null;
    }

    const contract = await tx.contract.findFirst({
      select: { id: true },
      where: {
        id: contractId,
        organizationId: adminMembership.organizationId,
      },
    });

    if (!contract) {
      throw new UserAdminError("No tienes permisos para administrar este contrato.");
    }

    const targetMembership = await tx.membership.findUnique({
      select: { userId: true },
      where: {
        userId_organizationId: {
          organizationId: adminMembership.organizationId,
          userId: targetUserId,
        },
      },
    });

    if (!targetMembership) {
      throw new UserAdminError("El usuario no pertenece a la organización del contrato.");
    }

    const requestedIds = Array.from(new Set(appViewIds));
    const activeViews = requestedIds.length > 0
      ? await tx.appView.findMany({
          select: { id: true },
          where: {
            active: true,
            contractId: contract.id,
            id: { in: requestedIds },
          },
        })
      : [];

    if (activeViews.length !== requestedIds.length) {
      throw new UserAdminError("Una o más experiencias no pertenecen a este contrato o están inactivas.");
    }

    const existingInactiveAssigned = await tx.userAppViewAccess.findMany({
      select: { appViewId: true },
      where: {
        appView: { active: false },
        contractId: contract.id,
        userId: targetUserId,
      },
    });
    const finalIds = Array.from(new Set([
      ...requestedIds,
      ...existingInactiveAssigned.map((access) => access.appViewId),
    ]));

    await tx.userAppViewAccess.deleteMany({
      where: {
        appView: { active: true },
        contractId: contract.id,
        userId: targetUserId,
      },
    });

    if (finalIds.length > 0) {
      await tx.userAppViewAccess.createMany({
        data: finalIds.map((appViewId) => ({
          appViewId,
          contractId: contract.id,
          userId: targetUserId,
        })),
        skipDuplicates: true,
      });
    }

    return { assignedAppViewIds: finalIds };
  });
}

export async function canDeleteUser({
  adminUserId,
  userId,
}: {
  adminUserId: string;
  userId: string;
}) {
  const organization = await resolveAdminOrganization(adminUserId);
  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        organizationId: organization.id,
        userId,
      },
    },
  });

  if (!membership) {
    return { canDelete: false, reason: "No se encontró el usuario." };
  }

  if (membership.role === "ADMIN") {
    const remainingAdmin = await prisma.membership.findFirst({
      select: { id: true },
      where: {
        id: { not: membership.id },
        organizationId: organization.id,
        role: "ADMIN",
        user: { active: true },
      },
    });

    if (!remainingAdmin) {
      return { canDelete: false, reason: organizationMustKeepAdminMessage };
    }
  }

  const auditEvent = await prisma.auditEvent.findFirst({
    select: { id: true },
    where: {
      actorUserId: userId,
      contract: {
        organizationId: organization.id,
      },
    },
  });

  if (auditEvent) {
    return { canDelete: false, reason: userHasHistoryCannotDeleteMessage };
  }

  return { canDelete: true, reason: null };
}

export async function deleteUserForAdmin({
  adminUserId,
  confirmationText,
  userId,
}: {
  adminUserId: string;
  confirmationText: string;
  userId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const membership = await getAdminMembershipByUserId(tx, adminUserId, userId);

    if (!membership) {
      return null;
    }

    if (confirmationText !== `Eliminar definitivamente a ${membership.user.name ?? membership.user.email}`) {
      throw new UserAdminError("La confirmación no coincide.");
    }

    if (membership.role === "ADMIN") {
      await assertOrganizationKeepsAdmin(tx, membership.organizationId, membership.id);
    }

    const auditEvent = await tx.auditEvent.findFirst({
      select: { id: true },
      where: {
        actorUserId: membership.userId,
        contract: {
          organizationId: membership.organizationId,
        },
      },
    });

    if (auditEvent) {
      throw new UserAdminError(userHasHistoryCannotDeleteMessage);
    }

    return tx.user.delete({ where: { id: membership.userId } });
  });
}

export async function isUserActive(userId: string) {
  const user = await prisma.user.findUnique({
    select: { active: true },
    where: { id: userId },
  });

  return Boolean(user?.active);
}

export function isUserAdminDatabaseConnectionError(
  error: unknown,
): error is UserAdminDatabaseConnectionError {
  return error instanceof UserAdminDatabaseConnectionError;
}

export function isPrismaConnectivityError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    errorCode?: unknown;
    message?: unknown;
    name?: unknown;
  };
  const code = typeof candidate.code === "string"
    ? candidate.code
    : typeof candidate.errorCode === "string"
      ? candidate.errorCode
      : undefined;

  if (code && prismaConnectivityErrorCodes.has(code)) {
    return true;
  }

  return (
    candidate.name === "PrismaClientInitializationError" &&
    typeof candidate.message === "string" &&
    candidate.message.includes("Can't reach database server")
  );
}

async function getAdminOrganizations(userId: string) {
  return withReadOnlyConnectivityRetry("getAdminOrganizations", () =>
    prisma.organization.findMany({
      orderBy: { name: "asc" },
      where: {
        memberships: {
          some: {
            role: "ADMIN",
            userId,
          },
        },
      },
    }),
  );
}

function resolveOrganizationFromList<T extends { id: string }>(organizations: T[]) {
  return organizations[0] ?? null;
}

async function resolveAdminOrganization(userId: string) {
  const organizations = await getAdminOrganizations(userId);
  const organization = resolveOrganizationFromList(organizations);

  if (!organization) {
    throw new UserAdminError("No tienes permisos para administrar usuarios.");
  }

  return organization;
}

async function getAdminMembership(
  tx: Prisma.TransactionClient,
  adminUserId: string,
  membershipId: string,
) {
  return tx.membership.findFirst({
    include: { organization: true, user: true },
    where: {
      id: membershipId,
      organization: {
        memberships: {
          some: {
            role: "ADMIN",
            userId: adminUserId,
          },
        },
      },
    },
  });
}

async function getAdminMembershipByUserId(
  tx: Prisma.TransactionClient,
  adminUserId: string,
  targetUserId: string,
) {
  return tx.membership.findFirst({
    include: { organization: true, user: true },
    where: {
      userId: targetUserId,
      organization: {
        memberships: {
          some: {
            role: "ADMIN",
            userId: adminUserId,
          },
        },
      },
    },
  });
}

async function assertOrganizationKeepsAdmin(
  tx: Prisma.TransactionClient,
  organizationId: string,
  excludedMembershipId: string,
) {
  const remainingAdmin = await tx.membership.findFirst({
    select: { id: true },
    where: {
      id: { not: excludedMembershipId },
      organizationId,
      role: "ADMIN",
      user: {
        active: true,
      },
    },
  });

  if (!remainingAdmin) {
    throw new UserAdminError(organizationMustKeepAdminMessage);
  }
}

function accessKey(contractId: string, appViewId: string) {
  return `${contractId}:${appViewId}`;
}

async function withReadOnlyConnectivityRetry<T>(
  operation: string,
  callback: () => Promise<T>,
) {
  try {
    return await callback();
  } catch (error) {
    if (!isPrismaConnectivityError(error)) {
      throw error;
    }

    console.error(`[user-admin] ${operation} failed with database connectivity error; retrying once.`, error);
    await delay(250);

    try {
      return await callback();
    } catch (retryError) {
      if (!isPrismaConnectivityError(retryError)) {
        throw retryError;
      }

      console.error(`[user-admin] ${operation} retry failed with database connectivity error.`, retryError);
      throw new UserAdminDatabaseConnectionError(retryError);
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
