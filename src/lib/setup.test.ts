import bcrypt from "bcrypt";
import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  createInitialSetup,
  getInitialSetupInput,
  InitialSetupError,
  initialSetupFriendlyError,
  isInitialSetupRequired,
  setupAlreadyConfiguredMessage,
} from "./setup";
import { prisma } from "./prisma";

vi.mock("./prisma", () => ({
  prisma: {
    organization: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const organizationFindFirst = vi.mocked(prisma.organization.findFirst);
const transaction = vi.mocked(prisma.$transaction);

function tx() {
  return {
    organization: {
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }) => ({
        id: "org_1",
        ...data,
      })),
    },
    user: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }) => ({
        id: "user_1",
        ...data,
      })),
    },
    membership: {
      create: vi.fn(async ({ data }) => ({
        id: "membership_1",
        ...data,
      })),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  organizationFindFirst.mockResolvedValue(null);
  transaction.mockImplementation(async (callback) => callback(tx() as never));
});

describe("initial setup", () => {
  it("requires setup only when no organization exists", async () => {
    organizationFindFirst.mockResolvedValueOnce(null);
    await expect(isInitialSetupRequired()).resolves.toBe(true);

    organizationFindFirst.mockResolvedValueOnce({ id: "org_1" } as never);
    await expect(isInitialSetupRequired()).resolves.toBe(false);
  });

  it("normalizes and validates setup input", () => {
    const formData = new FormData();

    formData.set("name", "  Daniel  ");
    formData.set("email", "  DANIEL@EXAMPLE.COM ");
    formData.set("password", "admin1234");
    formData.set("passwordConfirmation", "admin1234");
    formData.set("organizationName", "  Empresa A  ");

    expect(getInitialSetupInput(formData)).toMatchObject({
      name: "Daniel",
      email: "daniel@example.com",
      organizationName: "Empresa A",
    });
  });

  it("creates user, organization, and initial ADMIN membership atomically", async () => {
    const currentTx = tx();

    transaction.mockImplementationOnce(async (callback) => callback(currentTx as never));

    const result = await createInitialSetup({
      name: "Daniel",
      email: "daniel@example.com",
      password: "admin1234",
      passwordConfirmation: "admin1234",
      organizationName: "Empresa A",
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(currentTx.organization.findFirst).toHaveBeenCalledTimes(1);
    expect(currentTx.user.create.mock.calls[0][0].data).toMatchObject({
      name: "Daniel",
      email: "daniel@example.com",
      platformRole: "PLATFORM_ADMIN",
    });
    expect(currentTx.user.create.mock.calls[0][0].data.passwordHash).not.toBe("admin1234");
    await expect(
      bcrypt.compare("admin1234", currentTx.user.create.mock.calls[0][0].data.passwordHash),
    ).resolves.toBe(true);
    expect(currentTx.organization.create).toHaveBeenCalledWith({
      data: {
        name: "Empresa A",
        slug: "empresa-a",
      },
    });
    expect(currentTx.membership.create).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        organizationId: "org_1",
        role: "ADMIN",
      },
    });
    expect(result.membership.role).toBe("ADMIN");
    expect(result.user.platformRole).toBe("PLATFORM_ADMIN");
  });

  it("rejects a second setup inside the transaction", async () => {
    const currentTx = tx();

    currentTx.organization.findFirst.mockResolvedValueOnce({ id: "org_existing" } as never);
    transaction.mockImplementationOnce(async (callback) => callback(currentTx as never));

    await expect(
      createInitialSetup({
        name: "Daniel",
        email: "daniel@example.com",
        password: "admin1234",
        passwordConfirmation: "admin1234",
        organizationName: "Empresa A",
      }),
    ).rejects.toThrow(setupAlreadyConfiguredMessage);
    expect(currentTx.user.create).not.toHaveBeenCalled();
    expect(currentTx.organization.create).not.toHaveBeenCalled();
    expect(currentTx.membership.create).not.toHaveBeenCalled();
  });

  it("rejects duplicate email before creating organization", async () => {
    const currentTx = tx();

    currentTx.user.findUnique.mockResolvedValueOnce({ id: "user_existing" } as never);
    transaction.mockImplementationOnce(async (callback) => callback(currentTx as never));

    await expect(
      createInitialSetup({
        name: "Daniel",
        email: "daniel@example.com",
        password: "admin1234",
        passwordConfirmation: "admin1234",
        organizationName: "Empresa A",
      }),
    ).rejects.toThrow("Ya existe un usuario con ese email.");
    expect(currentTx.organization.create).not.toHaveBeenCalled();
  });

  it("maps setup race serialization failures to the configured message", () => {
    const error = new InitialSetupError(setupAlreadyConfiguredMessage);

    expect(initialSetupFriendlyError(error)).toBe(setupAlreadyConfiguredMessage);
  });
});
