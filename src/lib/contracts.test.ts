import { beforeEach, describe, expect, it, vi } from "vitest";

import { getUserContracts } from "./contracts";
import { prisma } from "./prisma";

vi.mock("./prisma", () => ({
  prisma: {
    contract: {
      findMany: vi.fn(),
    },
  },
}));

const contractFindMany = vi.mocked(prisma.contract.findMany);

beforeEach(() => {
  vi.clearAllMocks();
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
});
