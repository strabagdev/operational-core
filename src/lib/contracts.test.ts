import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAuthorizedContract, getUserContracts } from "./contracts";
import { prisma } from "./prisma";

vi.mock("./prisma", () => ({
  prisma: {
    contract: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    organization: {
      findMany: vi.fn(),
    },
  },
}));

const contractFindMany = vi.mocked(prisma.contract.findMany);
const contractFindFirst = vi.mocked(prisma.contract.findFirst);
const organizationFindMany = vi.mocked(prisma.organization.findMany);

beforeEach(() => {
  vi.clearAllMocks();
  contractFindFirst.mockResolvedValue(null);
  contractFindMany.mockResolvedValue([]);
  organizationFindMany.mockResolvedValue([]);
});

describe("contracts selector", () => {
  it("only exposes active contracts in the main selector", async () => {
    await getUserContracts("user_1");

    expect(contractFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "ACTIVE",
          organization: expect.objectContaining({
            active: true,
          }),
        }),
      }),
    );
  });

  it("rejects inactive, archived, or organization-inactive contracts in operational routes", async () => {
    await getAuthorizedContract("contract_1", "user_1");

    expect(contractFindMany).not.toHaveBeenCalled();
    expect(contractFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "contract_1",
          organization: expect.objectContaining({
            active: true,
          }),
          status: "ACTIVE",
        }),
      }),
    );
  });

  it("loads inactive organizations for the web operational state", async () => {
    const { getInactiveUserOrganizations } = await import("./contracts");

    await getInactiveUserOrganizations("user_1");

    expect(organizationFindMany).toHaveBeenCalledWith({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
      },
      where: {
        active: false,
        memberships: {
          some: {
            userId: "user_1",
          },
        },
      },
    });
  });
});
