import { randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { slugify } from "./format";
import { prisma } from "./prisma";

export const externalAppFormSchema = z.object({
  active: z.coerce.boolean().default(false),
  name: z.string().trim().min(1, "El nombre es obligatorio."),
  organizationId: z.string().trim().min(1, "Selecciona una organización."),
  slug: z.string().trim().min(1, "El slug es obligatorio."),
});

export type ExternalAppFormInput = z.infer<typeof externalAppFormSchema>;

export class ExternalAppAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExternalAppAdminError";
  }
}

export function getExternalAppFormInput(formData: FormData): ExternalAppFormInput {
  return externalAppFormSchema.parse({
    active: formData.get("active") === "on",
    name: formData.get("name"),
    organizationId: formData.get("organizationId"),
    slug: formData.get("slug"),
  });
}

export function externalAppAdminFriendlyError(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Revisa los datos de la aplicación.";
  }

  if (error instanceof ExternalAppAdminError) {
    return error.message;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return "Ya existe una aplicación con ese slug en esta organización.";
  }

  return "No se pudo completar la operación.";
}

export function normalizeExternalAppSlug(value: string) {
  return slugify(value);
}

export function generateExternalAppClientId() {
  return `opco_app_${randomBytes(24).toString("base64url")}`;
}

export function buildExternalAppAccessUrl() {
  const baseUrl = process.env.OPCO_CLIENT_PUBLIC_URL ?? "https://client.opco.cl";
  return new URL(baseUrl).toString();
}

export async function getExternalAppAdministration(userId: string, selectedOrganizationId?: string) {
  const organizations = await getAdminOrganizations(userId);
  const organization = selectedOrganizationId
    ? organizations.find((item) => item.id === selectedOrganizationId) ?? null
    : organizations.length === 1
      ? organizations[0]
      : null;

  if (!organization) {
    return { apps: [], organization: null, organizations };
  }

  const apps = await prisma.externalApp.findMany({
    where: {
      organizationId: organization.id,
    },
    include: {
      organization: true,
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return { apps, organization, organizations };
}

export async function createExternalAppForAdmin(
  userId: string,
  input: ExternalAppFormInput,
) {
  const organization = await resolveAdminOrganization(userId, input.organizationId);
  const name = input.name.trim();
  const slug = normalizeRequiredSlug(input.slug);

  await ensureUniqueExternalAppSlug({
    organizationId: organization.id,
    slug,
  });

  return prisma.externalApp.create({
    data: {
      active: input.active,
      clientId: generateExternalAppClientId(),
      name,
      organizationId: organization.id,
      slug,
    },
    include: {
      organization: true,
    },
  });
}

export async function updateExternalAppForAdmin(
  userId: string,
  externalAppId: string,
  input: ExternalAppFormInput,
) {
  const app = await getAdminExternalApp(userId, externalAppId);

  if (!app) {
    return null;
  }

  const name = input.name.trim();
  const slug = normalizeRequiredSlug(input.slug);

  await ensureUniqueExternalAppSlug({
    excludeExternalAppId: app.id,
    organizationId: app.organizationId,
    slug,
  });

  return prisma.externalApp.update({
    where: {
      id: app.id,
    },
    data: {
      active: input.active,
      name,
      slug,
    },
    include: {
      organization: true,
    },
  });
}

export async function setExternalAppActiveForAdmin(
  userId: string,
  externalAppId: string,
  active: boolean,
) {
  const app = await getAdminExternalApp(userId, externalAppId);

  if (!app) {
    return null;
  }

  if (app.active === active) {
    return app;
  }

  return prisma.externalApp.update({
    where: {
      id: app.id,
    },
    data: {
      active,
    },
    include: {
      organization: true,
    },
  });
}

async function getAdminOrganizations(userId: string) {
  return prisma.organization.findMany({
    orderBy: {
      name: "asc",
    },
    where: {
      memberships: {
        some: {
          role: "ADMIN",
          userId,
        },
      },
    },
  });
}

async function resolveAdminOrganization(userId: string, organizationId: string) {
  const organization = await prisma.organization.findFirst({
    where: {
      id: organizationId,
      memberships: {
        some: {
          role: "ADMIN",
          userId,
        },
      },
    },
  });

  if (!organization) {
    throw new ExternalAppAdminError("No tienes permisos para administrar aplicaciones.");
  }

  return organization;
}

async function getAdminExternalApp(userId: string, externalAppId: string) {
  return prisma.externalApp.findFirst({
    where: {
      id: externalAppId,
      organization: {
        memberships: {
          some: {
            role: "ADMIN",
            userId,
          },
        },
      },
    },
    include: {
      organization: true,
    },
  });
}

async function ensureUniqueExternalAppSlug({
  excludeExternalAppId,
  organizationId,
  slug,
}: {
  excludeExternalAppId?: string;
  organizationId: string;
  slug: string;
}) {
  const existing = await prisma.externalApp.findFirst({
    where: {
      organizationId,
      slug,
      ...(excludeExternalAppId ? { id: { not: excludeExternalAppId } } : {}),
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    throw new ExternalAppAdminError(
      "Ya existe una aplicación con ese slug en esta organización.",
    );
  }
}

function normalizeRequiredSlug(value: string) {
  const slug = normalizeExternalAppSlug(value);

  if (!slug) {
    throw new ExternalAppAdminError("El slug es obligatorio.");
  }

  return slug;
}
