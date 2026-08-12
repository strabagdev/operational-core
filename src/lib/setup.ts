import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { slugify } from "./format";
import { prisma } from "./prisma";

export const initialSetupSuccessMessage =
  "Configuración inicial completada. Inicia sesión.";
export const setupAlreadyConfiguredMessage =
  "Operational Core ya fue configurado.";

export const setupFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio."),
  email: z.string().trim().toLowerCase().email("Ingresa un email válido."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
  passwordConfirmation: z.string(),
  organizationName: z.string().trim().min(1, "El nombre de la organización es obligatorio."),
}).refine((input) => input.password === input.passwordConfirmation, {
  message: "La confirmación de contraseña no coincide.",
  path: ["passwordConfirmation"],
});

export type InitialSetupInput = z.infer<typeof setupFormSchema>;

export class InitialSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InitialSetupError";
  }
}

export async function isInitialSetupRequired() {
  const organization = await prisma.organization.findFirst({
    where: {
      memberships: {
        some: { role: "ADMIN" },
      },
    },
    select: { id: true },
  });

  return !organization;
}

export function getInitialSetupInput(formData: FormData): InitialSetupInput {
  return setupFormSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
    organizationName: formData.get("organizationName"),
  });
}

export function initialSetupFriendlyError(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Revisa los datos de configuración.";
  }

  if (error instanceof InitialSetupError) {
    return error.message;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
    return setupAlreadyConfiguredMessage;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return "Ya existe un usuario u organización con esos datos.";
  }

  return "No se pudo completar la configuración inicial.";
}

export async function createInitialSetup(input: InitialSetupInput) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const organizationName = input.organizationName.trim();
  const passwordHash = await bcrypt.hash(input.password, 12);

  return prisma.$transaction(
    async (tx) => {
      const existingOrganization = await tx.organization.findFirst({
        where: {
          memberships: {
            some: { role: "ADMIN" },
          },
        },
        select: { id: true },
      });

      if (existingOrganization) {
        throw new InitialSetupError(setupAlreadyConfiguredMessage);
      }

      const existingUser = await tx.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existingUser) {
        throw new InitialSetupError("Ya existe un usuario con ese email.");
      }

      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
        },
      });
      const organization = await tx.organization.create({
        data: {
          name: organizationName,
          slug: await uniqueOrganizationSlug(tx, organizationName),
        },
      });
      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: "ADMIN",
        },
      });

      return { user, organization, membership };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function uniqueOrganizationSlug(
  tx: Prisma.TransactionClient,
  organizationName: string,
) {
  const base = slugify(organizationName) || "organizacion";
  let slug = base;
  let suffix = 2;

  while (
    await tx.organization.findUnique({
      where: { slug },
      select: { id: true },
    })
  ) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}
