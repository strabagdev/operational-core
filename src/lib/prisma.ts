import "server-only";

import { PrismaClient } from "@prisma/client";

import { assertLocalDevelopmentDatabaseEnvironment } from "../../scripts/local-development-target.mjs";

if (process.env.NODE_ENV === "development") {
  assertLocalDevelopmentDatabaseEnvironment(process.env);
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
