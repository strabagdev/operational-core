import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertCanRemovePlatformAdmin,
  assertCanSetPlatformRole,
  lastPlatformAdminMessage,
  PlatformAuthError,
  requirePlatformAdmin,
  userIsPlatformAdmin,
} from "./platform-auth";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

const { auth } = await import("@/auth");
const authMock = vi.mocked(auth);
const userFindUnique = vi.mocked(prisma.user.findUnique);

function tx() {
  return {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("platform auth", () => {
  it("recognizes PLATFORM_ADMIN users only when the user is active", async () => {
    userFindUnique.mockResolvedValueOnce({
      active: true,
      platformRole: "PLATFORM_ADMIN",
    } as never);

    await expect(userIsPlatformAdmin("user_1")).resolves.toBe(true);

    userFindUnique.mockResolvedValueOnce({
      active: true,
      platformRole: "NONE",
    } as never);

    await expect(userIsPlatformAdmin("user_2")).resolves.toBe(false);

    userFindUnique.mockResolvedValueOnce({
      active: false,
      platformRole: "PLATFORM_ADMIN",
    } as never);

    await expect(userIsPlatformAdmin("user_3")).resolves.toBe(false);
  });

  it("does not treat organization ADMIN membership as platform admin", async () => {
    userFindUnique.mockResolvedValueOnce({
      active: true,
      platformRole: "NONE",
    } as never);

    await expect(userIsPlatformAdmin("org_admin")).resolves.toBe(false);
    expect(userFindUnique).toHaveBeenCalledWith({
      select: {
        active: true,
        platformRole: true,
      },
      where: { id: "org_admin" },
    });
  });

  it("requires an authenticated active PLATFORM_ADMIN from the database", async () => {
    authMock.mockResolvedValueOnce({
      user: { id: "platform_user" },
    } as never);
    userFindUnique.mockResolvedValueOnce({
      active: true,
      email: "admin@example.com",
      id: "platform_user",
      name: "Admin",
      platformRole: "PLATFORM_ADMIN",
    } as never);

    await expect(requirePlatformAdmin()).resolves.toMatchObject({
      id: "platform_user",
      platformRole: "PLATFORM_ADMIN",
    });
  });

  it("rejects normal organization admins and inactive users", async () => {
    authMock.mockResolvedValue({
      user: { id: "user_1" },
    } as never);

    userFindUnique.mockResolvedValueOnce({
      active: true,
      email: "org-admin@example.com",
      id: "user_1",
      name: "Org Admin",
      platformRole: "NONE",
    } as never);

    await expect(requirePlatformAdmin()).rejects.toThrow(
      "No tienes permisos de administración global.",
    );

    userFindUnique.mockResolvedValueOnce({
      active: false,
      email: "platform@example.com",
      id: "user_1",
      name: "Inactive Platform Admin",
      platformRole: "PLATFORM_ADMIN",
    } as never);

    await expect(requirePlatformAdmin()).rejects.toThrow("Usuario inactivo.");
  });

  it("prevents removing the last active PLATFORM_ADMIN", async () => {
    const currentTx = tx();

    currentTx.user.findUnique.mockResolvedValueOnce({
      platformRole: "PLATFORM_ADMIN",
    });
    currentTx.user.findFirst.mockResolvedValueOnce(null);

    await expect(
      assertCanRemovePlatformAdmin(currentTx as never, "platform_user"),
    ).rejects.toThrow(lastPlatformAdminMessage);
  });

  it("prevents demoting the last active PLATFORM_ADMIN", async () => {
    const currentTx = tx();

    currentTx.user.findUnique.mockResolvedValueOnce({
      platformRole: "PLATFORM_ADMIN",
    });
    currentTx.user.findFirst.mockResolvedValueOnce(null);

    await expect(
      assertCanSetPlatformRole(currentTx as never, "platform_user", "NONE"),
    ).rejects.toThrow(lastPlatformAdminMessage);
  });

  it("allows removing a PLATFORM_ADMIN when another active one exists", async () => {
    const currentTx = tx();

    currentTx.user.findUnique.mockResolvedValueOnce({
      platformRole: "PLATFORM_ADMIN",
    });
    currentTx.user.findFirst.mockResolvedValueOnce({
      id: "other_platform_user",
    });

    await expect(
      assertCanRemovePlatformAdmin(currentTx as never, "platform_user"),
    ).resolves.toBeUndefined();
  });

  it("does not block regular users", async () => {
    const currentTx = tx();

    currentTx.user.findUnique.mockResolvedValueOnce({
      platformRole: "NONE",
    });

    await expect(
      assertCanRemovePlatformAdmin(currentTx as never, "regular_user"),
    ).resolves.toBeUndefined();
    expect(currentTx.user.findFirst).not.toHaveBeenCalled();
  });

  it("exposes a domain error type for callers", () => {
    expect(new PlatformAuthError("x")).toBeInstanceOf(Error);
  });
});
