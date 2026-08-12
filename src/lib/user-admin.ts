import bcrypt from "bcrypt";
import { MembershipRole, Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "./prisma";

export const organizationMustKeepAdminMessage =
  "La organización debe mantener al menos un administrador.";
export const userAlreadyBelongsToAnotherOrganizationMessage =
  "Este usuario ya pertenece a otra organización.";

export const userFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio."),
  email: z.string().trim().toLowerCase().email("Ingresa un email válido."),
  password: z.string().optional(),
  role: z.enum(["ADMIN", "MEMBER"]),
  organizationId: z.string().trim().optional(),
});

export type UserFormInput = z.infer<typeof userFormSchema>;

export class UserAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserAdminError";
  }
}

export function getUserFormInput(formData: FormData): UserFormInput {
  return userFormSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password") || undefined,
    role: formData.get("role") || "MEMBER",
    organizationId: formData.get("organizationId") || undefined,
  });
}

export function userAdminFriendlyError(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Revisa los datos del usuario.";
  }

  if (error instanceof UserAdminError) {
    return error.message;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return "El usuario ya pertenece a esta organización.";
  }

  return "No se pudo completar la operación.";
}

export async function getUserAdministration({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId?: string;
}) {
  const organizations = await getAdminOrganizations(userId);
  const organization = resolveOrganizationFromList(organizations, organizationId);

  if (!organization) {
    return { organizations, organization: null, memberships: [] };
  }

  const memberships = await prisma.membership.findMany({
    where: { organizationId: organization.id },
    include: { user: true },
    orderBy: [{ role: "asc" }, { user: { name: "asc" } }, { user: { email: "asc" } }],
  });

  return { organizations, organization, memberships };
}

export async function addUserToOrganization(adminUserId: string, input: UserFormInput) {
  const organization = await resolveAdminOrganization(adminUserId, input.organizationId);
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  return prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      const existingMembership = await tx.membership.findFirst({
        where: { userId: existingUser.id },
        select: {
          id: true,
          organizationId: true,
        },
      });

      if (existingMembership) {
        throw new UserAdminError(
          existingMembership.organizationId === organization.id
            ? "El usuario ya pertenece a esta organización."
            : userAlreadyBelongsToAnotherOrganizationMessage,
        );
      }

      const membership = await tx.membership.create({
        data: {
          userId: existingUser.id,
          organizationId: organization.id,
          role: input.role,
        },
      });

      return { membership, user: existingUser, existingUser: true };
    }

    if (!input.password || input.password.length < 8) {
      throw new UserAdminError("La contraseña inicial debe tener al menos 8 caracteres.");
    }

    const user = await tx.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(input.password, 12),
      },
    });
    const membership = await tx.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: input.role,
      },
    });

    return { membership, user, existingUser: false };
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
      where: { id: membership.id },
      data: { role },
      include: { user: true, organization: true },
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

async function getAdminOrganizations(userId: string) {
  return prisma.organization.findMany({
    where: {
      memberships: {
        some: {
          userId,
          role: "ADMIN",
        },
      },
    },
    orderBy: { name: "asc" },
  });
}

function resolveOrganizationFromList<
  T extends { id: string },
>(organizations: T[], organizationId?: string) {
  if (organizations.length === 0) {
    return null;
  }

  return organizationId
    ? organizations.find((organization) => organization.id === organizationId) ?? null
    : organizations[0];
}

async function resolveAdminOrganization(userId: string, organizationId?: string) {
  const organizations = await getAdminOrganizations(userId);
  const organization = resolveOrganizationFromList(organizations, organizationId);

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
    where: {
      id: membershipId,
      organization: {
        memberships: {
          some: {
            userId: adminUserId,
            role: "ADMIN",
          },
        },
      },
    },
    include: { user: true, organization: true },
  });
}

async function assertOrganizationKeepsAdmin(
  tx: Prisma.TransactionClient,
  organizationId: string,
  excludedMembershipId: string,
) {
  const remainingAdmin = await tx.membership.findFirst({
    where: {
      organizationId,
      role: "ADMIN",
      id: { not: excludedMembershipId },
    },
    select: { id: true },
  });

  if (!remainingAdmin) {
    throw new UserAdminError(organizationMustKeepAdminMessage);
  }
}
