import bcrypt from "bcrypt";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authorizeWebCredentials } from "@/lib/web-auth";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

const userFindUnique = vi.mocked(prisma.user.findUnique);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Auth.js web credentials", () => {
  it("authenticates active users with valid credentials", async () => {
    userFindUnique.mockResolvedValueOnce({
      active: true,
      email: "user@example.com",
      id: "user_1",
      image: null,
      name: "User One",
      passwordHash: await bcrypt.hash("secret123", 12),
    } as never);

    await expect(authorizeWebCredentials({
      email: " USER@example.com ",
      password: "secret123",
    })).resolves.toMatchObject({
      email: "user@example.com",
      id: "user_1",
    });
  });

  it("rejects inactive users without revealing account state", async () => {
    userFindUnique.mockResolvedValueOnce({
      active: false,
      email: "user@example.com",
      id: "user_1",
      image: null,
      name: "User One",
      passwordHash: await bcrypt.hash("secret123", 12),
    } as never);

    await expect(authorizeWebCredentials({
      email: "user@example.com",
      password: "secret123",
    })).resolves.toBeNull();
  });
});
