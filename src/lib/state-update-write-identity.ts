import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { StateUpdateContext, StateUpdateInput } from "./state-update-workflow";

// Legacy update-current policies have no persistent Definition/Slot. Serialize their
// declared identity, not an AppView, user, request key, state, or extra value.
// This is a cooperative workflow lock; generic record writers do not acquire it.
export function stateUpdateWriteIdentityKey(
  contractId: string,
  context: StateUpdateContext,
  input: StateUpdateInput,
): string | null {
  const { config } = context;
  if (config.historyMode !== "update-current" ||
      (config.uniqueness.mode !== "subject" && config.uniqueness.mode !== "subject-date")) return null;

  const fields: Array<[string, string]> = [[config.subjectFieldId, input.subjectRecordId]];
  if (config.uniqueness.mode === "subject-date") {
    if (!config.dateFieldId || !input.date || Number.isNaN(input.date.getTime())) {
      throw new Error("STATE_UPDATE_WRITE_IDENTITY_INCOMPLETE");
    }
    fields.push([config.dateFieldId, input.date.toISOString().slice(0, 10)]);
  }
  fields.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return JSON.stringify(["state-update-write", 1, contractId, context.targetEntityType.id, fields]);
}

export async function withStateUpdateWriteIdentity<T>(
  context: StateUpdateContext,
  input: StateUpdateInput,
  contractId: string,
  work: (scoped: StateUpdateContext) => Promise<T>,
): Promise<T> {
  const key = stateUpdateWriteIdentityKey(contractId, context, input);
  if (key === null) return work(context);

  const run = async (transaction: Prisma.TransactionClient) => {
    // Released on commit/rollback, including process/connection loss. A hash
    // collision only serializes unrelated work; equality still uses real fields.
    await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
    return work({ ...context, transaction });
  };
  // A waiter must read the owner's committed result after acquiring the lock.
  // Public legacy endpoints own this transaction. Trusted callers supplying a
  // transaction must likewise use READ COMMITTED (composite slots bypass this).
  return context.transaction ? run(context.transaction) : prisma.$transaction(run, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  });
}
