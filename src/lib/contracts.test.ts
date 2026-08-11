import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAuthorizedContract, getUserContracts } from "./contracts";
import { prisma } from "./prisma";

vi.mock("./prisma", () => ({
  prisma: {
    contract: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

const contractFindMany = vi.mocked(prisma.contract.findMany);
const contractFindFirst = vi.mocked(prisma.contract.findFirst);

beforeEach(() => {
  vi.clearAllMocks();
  contractFindFirst.mockResolvedValue(null);
  contractFindMany.mockResolvedValue([]);
});

describe("contracts selector", () => {
  it("only exposes active contracts in the main selector", async () => {
    await getUserContracts("user_1");

    expect(contractFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "ACTIVE",
        }),
      }),
    );
  });

  it("rejects inactive or archived contracts in operational routes", async () => {
    await getAuthorizedContract("contract_1", "user_1");

    expect(contractFindMany).not.toHaveBeenCalled();
    expect(contractFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "contract_1",
          status: "ACTIVE",
        }),
      }),
    );
  });
});
