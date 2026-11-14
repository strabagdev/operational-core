import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma, type PrismaClient } from "@prisma/client";

// Only explicitly negotiated, read-only requests enter this scope. Legacy consumers use root.
const scope = new AsyncLocalStorage<Prisma.TransactionClient>();
export function snapshotPrismaClient(root: PrismaClient): PrismaClient {
  return new Proxy(root, {
    get(target, property) {
      const transaction = scope.getStore();
      const client = transaction ?? target;
      if (transaction && ["$transaction", "$connect", "$disconnect", "$extends", "$on", "$use"].includes(String(property))) {
        throw new Error("READ_SNAPSHOT_CLIENT_ESCAPE");
      }
      const value = Reflect.get(client, property);
      return typeof value === "function" ? value.bind(client) : value;
    },
  });
}
export async function runPrismaReadSnapshot<T>(root: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  if (scope.getStore()) throw new Error("NESTED_READ_SNAPSHOT");
  return root.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return scope.run(tx, () => work(tx));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5000, timeout: 15000 });
}
