import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { normalizeOrganizationSlug } from "./organization-slug";
import { assertPlatformAdminUserId, PlatformAuthError } from "./platform-auth";
import { prisma } from "./prisma";

export const existingOrganizationAdminEmailMessage =
  "El email ya existe. Actualmente un usuario no puede pertenecer a múltiples organizaciones.";
export const platformOrganizationAuditPendingNote =
  "Platform-level audit pendiente.";

const slugSchema = z.string().trim().min(1, "El slug es obligatorio.");

export const organizationFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio."),
  slug: slugSchema.transform(normalizeOrganizationSlug).refine(Boolean, {
    message: "El slug es obligatorio.",
  }),
});

export const createOrganizationFormSchema = z.object({
  adminEmail: z.string().trim().toLowerCase().email("Ingresa un email válido para el administrador."),
  adminName: z.string().trim().min(1, "El nombre del administrador es obligatorio."),
  adminPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
  name: z.string().trim().min(1, "El nombre es obligatorio."),
  slug: slugSchema.transform(normalizeOrganizationSlug).refine(Boolean, {
    message: "El slug es obligatorio.",
  }),
});

export type OrganizationFormInput = z.infer<typeof organizationFormSchema>;
export type CreateOrganizationFormInput = z.infer<typeof createOrganizationFormSchema>;

export class PlatformOrganizationAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformOrganizationAdminError";
  }
}

export function getOrganizationFormInput(formData: FormData): OrganizationFormInput {
  return organizationFormSchema.parse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });
}

export function getCreateOrganizationFormInput(formData: FormData): CreateOrganizationFormInput {
  return createOrganizationFormSchema.parse({
    adminEmail: formData.get("adminEmail"),
    adminName: formData.get("adminName"),
    adminPassword: formData.get("adminPassword"),
    name: formData.get("name"),
    slug: formData.get("slug"),
  });
}

export function platformOrganizationAdminFriendlyError(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Revisa los datos de la organización.";
  }

  if (error instanceof PlatformOrganizationAdminError || error instanceof PlatformAuthError) {
    return error.message;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return "Ya existe una organización con ese slug.";
  }

  return "No se pudo completar la operación.";
}

export async function getPlatformOrganizations(platformUserId: string) {
  await assertPlatformAdminUserId(platformUserId);

  const organizations = await prisma.organization.findMany({
    include: {
      _count: {
        select: {
          contracts: true,
          externalApps: true,
          memberships: true,
        },
      },
      memberships: {
        include: {
          user: {
            select: {
              active: true,
              email: true,
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ user: { name: "asc" } }, { user: { email: "asc" } }],
        where: {
          role: "ADMIN",
        },
      },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return organizations.map((organization) => ({
    active: organization.active,
    adminUsers: organization.memberships.map((membership) => membership.user),
    contractCount: organization._count.contracts,
    createdAt: organization.createdAt,
    externalAppCount: organization._count.externalApps,
    id: organization.id,
    membershipCount: organization._count.memberships,
    name: organization.name,
    slug: organization.slug,
    updatedAt: organization.updatedAt,
  }));
}

export async function getPlatformOrganization(platformUserId: string, organizationId: string) {
  await assertPlatformAdminUserId(platformUserId);

  return prisma.organization.findUnique({
    include: {
      contracts: {
        orderBy: [{ status: "asc" }, { name: "asc" }],
        select: {
          code: true,
          id: true,
          name: true,
          status: true,
          updatedAt: true,
        },
      },
      externalApps: {
        orderBy: [{ active: "desc" }, { name: "asc" }],
        select: {
          active: true,
          id: true,
          name: true,
          slug: true,
          updatedAt: true,
        },
      },
      memberships: {
        include: {
          user: {
            select: {
              active: true,
              email: true,
              id: true,
              name: true,
              platformRole: true,
            },
          },
        },
        orderBy: [{ role: "asc" }, { user: { name: "asc" } }, { user: { email: "asc" } }],
      },
    },
    where: { id: organizationId },
  });
}

export async function createOrganizationWithInitialAdmin(
  platformUserId: string,
  input: CreateOrganizationFormInput,
) {
  await assertPlatformAdminUserId(platformUserId);
  input = createOrganizationFormSchema.parse(input);

  await ensureUniqueOrganizationSlug(input.slug);

  const existingUser = await prisma.user.findUnique({
    select: { id: true },
    where: { email: input.adminEmail },
  });

  if (existingUser) {
    throw new PlatformOrganizationAdminError(existingOrganizationAdminEmailMessage);
  }

  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        active: true,
        name: input.name,
        slug: input.slug,
      },
    });
    const user = await tx.user.create({
      data: {
        active: true,
        email: input.adminEmail,
        name: input.adminName,
        passwordHash: await bcrypt.hash(input.adminPassword, 12),
        platformRole: "NONE",
      },
    });
    const membership = await tx.membership.create({
      data: {
        organizationId: organization.id,
        role: "ADMIN",
        userId: user.id,
      },
    });

    return { membership, organization, user };
  });
}

export async function updateOrganization(
  platformUserId: string,
  organizationId: string,
  input: OrganizationFormInput,
) {
  await assertPlatformAdminUserId(platformUserId);
  input = organizationFormSchema.parse(input);

  const organization = await prisma.organization.findUnique({
    select: { id: true },
    where: { id: organizationId },
  });

  if (!organization) {
    return null;
  }

  await ensureUniqueOrganizationSlug(input.slug, organizationId);

  return prisma.organization.update({
    data: {
      name: input.name,
      slug: input.slug,
    },
    where: { id: organizationId },
  });
}

export async function setOrganizationActive(
  platformUserId: string,
  organizationId: string,
  active: boolean,
) {
  await assertPlatformAdminUserId(platformUserId);

  const organization = await prisma.organization.findUnique({
    select: {
      active: true,
      id: true,
    },
    where: { id: organizationId },
  });

  if (!organization) {
    return null;
  }

  if (organization.active === active) {
    return organization;
  }

  return prisma.organization.update({
    data: { active },
    where: { id: organizationId },
  });
}

async function ensureUniqueOrganizationSlug(slug: string, excludeOrganizationId?: string) {
  const existing = await prisma.organization.findUnique({
    select: { id: true },
    where: { slug },
  });

  if (existing && existing.id !== excludeOrganizationId) {
    throw new PlatformOrganizationAdminError("Ya existe una organización con ese slug.");
  }
}
