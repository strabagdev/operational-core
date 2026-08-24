import { Prisma } from "@prisma/client";

import { getAppViewTypeLabel, parseAppViewConfig, summarizeAppViewConfig } from "./app-views";
import { canManageViewAccess } from "./capabilities";
import { prisma } from "./prisma";

export type AppViewAccessInput = {
  appViewIds: string[];
  contractId: string;
  targetUserId: string;
};

export class AppViewAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppViewAccessError";
  }
}

export async function getAppViewAccessAdminData({
  adminUserId,
  contractId,
  selectedUserId,
}: {
  adminUserId: string;
  contractId: string;
  selectedUserId?: string;
}) {
  const admin = await getContractAdminContext({ contractId, userId: adminUserId });

  if (!admin) {
    return null;
  }

  const [memberships, appViews] = await Promise.all([
    prisma.membership.findMany({
      orderBy: [{ user: { name: "asc" } }, { user: { email: "asc" } }],
      select: {
        role: true,
        user: {
          select: {
            email: true,
            id: true,
            name: true,
          },
        },
      },
      where: {
        organizationId: admin.contract.organizationId,
      },
    }),
    prisma.appView.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
      where: {
        contractId: admin.contract.id,
      },
    }),
  ]);
  const selectedUser = memberships.find((membership) => membership.user.id === selectedUserId)
    ?? memberships[0]
    ?? null;
  const assignedAccesses = selectedUser
    ? await prisma.userAppViewAccess.findMany({
        select: {
          appViewId: true,
        },
        where: {
          contractId: admin.contract.id,
          userId: selectedUser.user.id,
        },
      })
    : [];
  const entityTypes = await prisma.entityType.findMany({
    orderBy: { name: "asc" },
    select: {
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
      contractId: admin.contract.id,
    },
  });

  return {
    appViews: appViews.map((view) => {
      const config = parseAppViewConfig(view);

      return {
        active: view.active,
        config,
        icon: view.icon,
        id: view.id,
        name: view.name,
        sortOrder: view.sortOrder,
        summary: summarizeAppViewConfig({ config, entityTypes }),
        type: view.type,
        typeLabel: getAppViewTypeLabel(view.type),
      };
    }),
    assignedAppViewIds: new Set(assignedAccesses.map((access) => access.appViewId)),
    contract: admin.contract,
    memberships,
    selectedUser,
  };
}

export function getAppViewAccessInput(formData: FormData): AppViewAccessInput {
  return {
    appViewIds: formData
      .getAll("appViewIds")
      .map((value) => String(value).trim())
      .filter(Boolean),
    contractId: String(formData.get("contractId") ?? "").trim(),
    targetUserId: String(formData.get("targetUserId") ?? "").trim(),
  };
}

export async function updateUserAppViewAccess({
  adminUserId,
  input,
}: {
  adminUserId: string;
  input: AppViewAccessInput;
}) {
  const admin = await getContractAdminContext({
    contractId: input.contractId,
    userId: adminUserId,
  });

  if (!admin) {
    return null;
  }

  const targetMembership = await prisma.membership.findUnique({
    select: {
      userId: true,
    },
    where: {
      userId_organizationId: {
        organizationId: admin.contract.organizationId,
        userId: input.targetUserId,
      },
    },
  });

  if (!targetMembership) {
    throw new AppViewAccessError("El usuario no pertenece a la organización del contrato.");
  }

  const requestedIds = Array.from(new Set(input.appViewIds));
  const activeViews = requestedIds.length > 0
    ? await prisma.appView.findMany({
        select: {
          id: true,
        },
        where: {
          active: true,
          contractId: admin.contract.id,
          id: {
            in: requestedIds,
          },
        },
      })
    : [];

  if (activeViews.length !== requestedIds.length) {
    throw new AppViewAccessError("Una o más experiencias no pertenecen a este contrato o están inactivas.");
  }

  const existingInactiveAssigned = await prisma.userAppViewAccess.findMany({
    select: {
      appViewId: true,
    },
    where: {
      appView: {
        active: false,
      },
      contractId: admin.contract.id,
      userId: input.targetUserId,
    },
  });
  const finalIds = Array.from(new Set([
    ...requestedIds,
    ...existingInactiveAssigned.map((access) => access.appViewId),
  ]));

  await prisma.$transaction(async (tx) => {
    await tx.userAppViewAccess.deleteMany({
      where: {
        appView: {
          active: true,
        },
        contractId: admin.contract.id,
        userId: input.targetUserId,
      },
    });

    if (finalIds.length > 0) {
      await tx.userAppViewAccess.createMany({
        data: finalIds.map((appViewId) => ({
          appViewId,
          contractId: admin.contract.id,
          userId: input.targetUserId,
        })),
        skipDuplicates: true,
      });
    }
  });

  return { assignedAppViewIds: finalIds };
}

export async function userCanAccessAppView({
  appViewId,
  contractId,
  userId,
}: {
  appViewId: string;
  contractId: string;
  userId: string;
}) {
  const access = await prisma.userAppViewAccess.findUnique({
    where: {
      userId_contractId_appViewId: {
        appViewId,
        contractId,
        userId,
      },
    },
  });

  return Boolean(access);
}

export async function getEffectiveAppViewsForUserContract({
  contractId,
  userId,
}: {
  contractId: string;
  userId: string;
}) {
  return prisma.appView.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
    where: {
      active: true,
      contractId,
      userAccesses: {
        some: {
          contractId,
          userId,
        },
      },
    },
  });
}

export function appViewAccessFriendlyError(error: unknown) {
  if (error instanceof AppViewAccessError) {
    return error.message;
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return "La experiencia ya estaba asignada a este usuario.";
  }

  return "No fue posible guardar las asignaciones.";
}

async function getContractAdminContext({
  contractId,
  userId,
}: {
  contractId: string;
  userId: string;
}) {
  const contract = await prisma.contract.findFirst({
    select: {
      id: true,
      name: true,
      organizationId: true,
    },
    where: {
      id: contractId,
      status: "ACTIVE",
    },
  });

  if (!contract) {
    return null;
  }

  const membership = await prisma.membership.findUnique({
    select: {
      role: true,
    },
    where: {
      userId_organizationId: {
        organizationId: contract.organizationId,
        userId,
      },
    },
  });

  if (!canManageViewAccess({ membershipRole: membership?.role })) {
    return null;
  }

  return { contract, membership };
}
