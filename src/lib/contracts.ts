import { cache } from "react";

import { prisma } from "./prisma";

export const getUserContracts = cache(async (userId: string) => {
  return prisma.contract.findMany({
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
      organization: true,
    },
    orderBy: [{ organization: { name: "asc" } }, { name: "asc" }],
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
    return prisma.contract.findFirst({
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
        organization: true,
      },
    });
  },
);
