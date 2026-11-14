import "server-only";

import { snapshotPrismaClient, runPrismaReadSnapshot } from "./prisma-read-snapshot";

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const root = globalForPrisma.prisma ?? new PrismaClient();
export const prisma = snapshotPrismaClient(root);
export const withPrismaReadSnapshot = <T>(work: Parameters<typeof runPrismaReadSnapshot<T>>[1]) => runPrismaReadSnapshot(root, work);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = root;
}
