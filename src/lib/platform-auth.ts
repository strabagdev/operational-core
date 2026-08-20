import type { PlatformRole, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const lastPlatformAdminMessage =
  "La plataforma debe mantener al menos un administrador global activo.";

export class PlatformAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformAuthError";
  }
}

export async function userIsPlatformAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    select: {
      active: true,
      platformRole: true,
    },
    where: { id: userId },
  });

  return user?.active === true && user.platformRole === "PLATFORM_ADMIN";
}

export async function assertPlatformAdminUserId(userId: string) {
  const user = await prisma.user.findUnique({
    select: {
      active: true,
      email: true,
      id: true,
      name: true,
      platformRole: true,
    },
    where: { id: userId },
  });

  if (!user?.active) {
    throw new PlatformAuthError("Usuario inactivo.");
  }

  if (user.platformRole !== "PLATFORM_ADMIN") {
    throw new PlatformAuthError("No tienes permisos de administración global.");
  }

  return user;
}

export async function requirePlatformAdmin() {
  const { auth } = await import("@/auth");
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new PlatformAuthError("Debes iniciar sesión.");
  }

  return assertPlatformAdminUserId(userId);
}

export async function assertCanRemovePlatformAdmin(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const user = await tx.user.findUnique({
    select: {
      platformRole: true,
    },
    where: { id: userId },
  });

  if (user?.platformRole !== "PLATFORM_ADMIN") {
    return;
  }

  const remainingPlatformAdmin = await tx.user.findFirst({
    select: { id: true },
    where: {
      active: true,
      id: { not: userId },
      platformRole: "PLATFORM_ADMIN",
    },
  });

  if (!remainingPlatformAdmin) {
    throw new PlatformAuthError(lastPlatformAdminMessage);
  }
}

export async function assertCanSetPlatformRole(
  tx: Prisma.TransactionClient,
  userId: string,
  nextPlatformRole: PlatformRole,
) {
  if (nextPlatformRole === "PLATFORM_ADMIN") {
    return;
  }

  await assertCanRemovePlatformAdmin(tx, userId);
}

export function isPlatformRole(value: unknown): value is PlatformRole {
  return value === "NONE" || value === "PLATFORM_ADMIN";
}
