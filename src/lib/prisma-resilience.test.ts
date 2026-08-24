import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  databaseUnavailableMessage,
  DatabaseUnavailableError,
  isDatabaseUnavailableError,
  isPrismaConnectionError,
  withPrismaReadRetry,
} from "./prisma-resilience";

vi.mock("./prisma", () => ({
  prisma: {
    $disconnect: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

function prismaKnownError(code: string, message = "Prisma error") {
  return new Prisma.PrismaClientKnownRequestError(message, {
    clientVersion: "6.19.3",
    code,
  });
}

describe("Prisma operational resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("recognizes transient Prisma connection errors", () => {
    expect(isPrismaConnectionError(prismaKnownError("P1017", "Server has closed the connection"))).toBe(true);
    expect(isPrismaConnectionError(prismaKnownError("P1001", "Can't reach database server"))).toBe(true);
    expect(isPrismaConnectionError(
      Object.assign(new Error("Can't reach database server at `db.example:5432`"), {
        name: "PrismaClientInitializationError",
      }),
    )).toBe(true);
  });

  it("does not classify functional Prisma errors as connection failures", () => {
    expect(isPrismaConnectionError(prismaKnownError("P2002", "Unique constraint failed"))).toBe(false);
    expect(isPrismaConnectionError(prismaKnownError("P2003", "Foreign key constraint failed"))).toBe(false);
    expect(isPrismaConnectionError(prismaKnownError("P2025", "Record not found"))).toBe(false);
    expect(isPrismaConnectionError(new Prisma.PrismaClientValidationError("Invalid input", {
      clientVersion: "6.19.3",
    }))).toBe(false);
  });

  it("retries a read once and returns the retry result", async () => {
    const connectionError = prismaKnownError("P1017", "Server has closed the connection");
    const callback = vi.fn()
      .mockRejectedValueOnce(connectionError)
      .mockResolvedValueOnce("ok");
    const resetConnection = vi.fn().mockResolvedValue(undefined);

    await expect(withPrismaReadRetry(callback, {
      context: "test.read",
      delayMs: 0,
      resetConnection,
    })).resolves.toBe("ok");

    expect(callback).toHaveBeenCalledTimes(2);
    expect(resetConnection).toHaveBeenCalledTimes(1);
  });

  it("surfaces a persistent read connection failure as DB_UNAVAILABLE", async () => {
    const connectionError = prismaKnownError("P1017", "Server has closed the connection");
    const callback = vi.fn().mockRejectedValue(connectionError);

    await expect(withPrismaReadRetry(callback, {
      context: "test.read",
      delayMs: 0,
      resetConnection: vi.fn().mockResolvedValue(undefined),
    })).rejects.toMatchObject({
      code: "DB_UNAVAILABLE",
      message: databaseUnavailableMessage,
      name: "DatabaseUnavailableError",
    });

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-connection errors or provide a write retry helper", async () => {
    const uniqueError = prismaKnownError("P2002", "Unique constraint failed");
    const callback = vi.fn().mockRejectedValue(uniqueError);

    await expect(withPrismaReadRetry(callback, {
      context: "test.read",
      delayMs: 0,
    })).rejects.toBe(uniqueError);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(await import("./prisma-resilience")).not.toHaveProperty("withPrismaWriteRetry");
  });

  it("detects DB_UNAVAILABLE through Auth.js nested error causes", () => {
    const unavailable = new DatabaseUnavailableError(new Error("closed"));
    const authWrapped = {
      cause: {
        err: unavailable,
      },
      name: "CallbackRouteError",
    };

    expect(isDatabaseUnavailableError(unavailable)).toBe(true);
    expect(isDatabaseUnavailableError(authWrapped)).toBe(true);
  });
});
