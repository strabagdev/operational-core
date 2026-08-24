import { cache } from "react";

import { canManageContract } from "./capabilities";
import { prisma } from "./prisma";

export const getUserContracts = cache(async (userId: string) => {
  const contracts = await prisma.contract.findMany({
    where: {
      status: "ACTIVE",
      organization: {
        active: true,
        memberships: {
          some: {
            userId,
          },
        },
      },
    },
    include: {
      organization: {
        include: {
          memberships: {
            select: { role: true },
            where: { userId },
          },
        },
      },
    },
    orderBy: [{ organization: { name: "asc" } }, { name: "asc" }],
  });

  return contracts.map(({ organization, ...contract }) => {
    const { memberships, ...organizationData } = organization;

    return {
      ...contract,
      membershipRole: memberships[0]?.role ?? null,
      organization: organizationData,
    };
  });
});

export const getInactiveUserOrganizations = cache(async (userId: string) => {
  return prisma.organization.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
    },
    where: {
      active: false,
      memberships: {
        some: {
          userId,
        },
      },
    },
  });
});

export const getAuthorizedContract = cache(
  async (contractId: string, userId: string) => {
    const contract = await prisma.contract.findFirst({
      where: {
        id: contractId,
        status: "ACTIVE",
        organization: {
          active: true,
          memberships: {
            some: {
              userId,
            },
          },
        },
      },
      include: {
        organization: {
          include: {
            memberships: {
              select: { role: true },
              where: { userId },
            },
          },
        },
      },
    });

    if (!contract) {
      return null;
    }

    const { organization, ...contractData } = contract;
    const { memberships, ...organizationData } = organization;

    return {
      ...contractData,
      membershipRole: memberships[0]?.role ?? null,
      organization: organizationData,
    };
  },
);

export const getAuthorizedContractAdmin = cache(
  async (contractId: string, userId: string) => {
    const contract = await getAuthorizedContract(contractId, userId);

    if (!contract || !canManageContract({ membershipRole: contract.membershipRole })) {
      return null;
    }

    return contract;
  },
);
