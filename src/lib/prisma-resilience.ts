import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";

export const databaseUnavailableCode = "DB_UNAVAILABLE";
export const databaseUnavailableMessage = "Servicio temporalmente no disponible.";

const prismaConnectionErrorCodes = new Set([
  "P1001",
  "P1002",
  "P1008",
  "P1011",
  "P1017",
]);

const prismaConnectionErrorMessages = [
  "server has closed the connection",
  "can't reach database server",
  "timed out fetching a new connection",
  "connection terminated unexpectedly",
  "connection closed",
];

const prismaRuntimeErrorNames = new Set([
  "PrismaClientInitializationError",
  "PrismaClientKnownRequestError",
  "PrismaClientRustPanicError",
  "PrismaClientUnknownRequestError",
]);

type PrismaErrorShape = {
  cause?: unknown;
  code?: unknown;
  errorCode?: unknown;
  message?: unknown;
  name?: unknown;
};

export class DatabaseUnavailableError extends Error {
  readonly code = databaseUnavailableCode;
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(databaseUnavailableMessage);
    this.name = "DatabaseUnavailableError";
    this.cause = cause;
  }
}

export function isDatabaseUnavailableError(error: unknown): error is DatabaseUnavailableError {
  if (error instanceof DatabaseUnavailableError) {
    return true;
  }

  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as PrismaErrorShape;

  if (candidate.code === databaseUnavailableCode || candidate.name === "DatabaseUnavailableError") {
    return true;
  }

  const authErrorCause = candidate.cause;

  if (authErrorCause && typeof authErrorCause === "object") {
    const nested = authErrorCause as { err?: unknown };

    return isDatabaseUnavailableError(nested.err) || isDatabaseUnavailableError(authErrorCause);
  }

  return false;
}

export function isPrismaConnectionError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as PrismaErrorShape;
  const code = typeof candidate.code === "string"
    ? candidate.code
    : typeof candidate.errorCode === "string"
      ? candidate.errorCode
      : undefined;

  if (code) {
    return prismaConnectionErrorCodes.has(code);
  }

  const name = typeof candidate.name === "string" ? candidate.name : "";
  const message = typeof candidate.message === "string"
    ? candidate.message.toLowerCase()
    : "";

  if (!prismaRuntimeErrorNames.has(name) || !message) {
    return false;
  }

  return prismaConnectionErrorMessages.some((pattern) => message.includes(pattern));
}

type PrismaReadRetryOptions = {
  context: string;
  delayMs?: number;
  onRetry?: (details: { context: string; error: unknown; retryAttempted: boolean }) => void;
  resetConnection?: () => Promise<void>;
};

export async function withPrismaReadRetry<T>(
  callback: () => Promise<T>,
  options: PrismaReadRetryOptions,
) {
  try {
    return await callback();
  } catch (error) {
    if (!isPrismaConnectionError(error)) {
      throw error;
    }

    logPrismaConnectionError({
      context: options.context,
      error,
      retryAttempted: true,
    });
    options.onRetry?.({ context: options.context, error, retryAttempted: true });
    await resetPrismaConnection(options.resetConnection);
    await delay(options.delayMs ?? 50);

    try {
      return await callback();
    } catch (retryError) {
      if (!isPrismaConnectionError(retryError)) {
        throw retryError;
      }

      logPrismaConnectionError({
        context: options.context,
        error: retryError,
        retryAttempted: false,
      });
      throw new DatabaseUnavailableError(retryError);
    }
  }
}

export async function checkPrismaReadiness() {
  try {
    await withPrismaReadRetry(
      () => prisma.$queryRaw(Prisma.sql`SELECT 1`),
      { context: "api.ready" },
    );

    return { ok: true as const };
  } catch (error) {
    if (isDatabaseUnavailableError(error) || isPrismaConnectionError(error)) {
      return { ok: false as const, reason: "database" as const };
    }

    throw error;
  }
}

function logPrismaConnectionError({
  context,
  error,
  retryAttempted,
}: {
  context: string;
  error: unknown;
  retryAttempted: boolean;
}) {
  const candidate = error as PrismaErrorShape;
  console.error("[db] transient connection error", {
    category: "prisma_connection",
    code: typeof candidate?.code === "string" ? candidate.code : undefined,
    context,
    name: typeof candidate?.name === "string" ? candidate.name : undefined,
    retryAttempted,
  });
}

async function resetPrismaConnection(resetConnection?: () => Promise<void>) {
  const disconnect = resetConnection ?? prisma.$disconnect?.bind(prisma);

  if (!disconnect) {
    return;
  }

  try {
    await disconnect();
  } catch {
    // The next Prisma operation can still establish a fresh connection.
  }
}

function delay(ms: number) {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
}
