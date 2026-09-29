import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getApiEntityDefinition, getApiEntityRecord } from "@/lib/api-entities";
import { patchApiEntityRecord } from "@/lib/api-record-writes";
import { updateEntityRecord } from "@/lib/entity-records";
import { prisma } from "@/lib/prisma";

const runPostgresIntegration = process.env.RECORD_PATCH_PG_INTEGRATION === "1";
const describePostgres = runPostgresIntegration ? describe.sequential : describe.skip;

const ids = {
  app: "records_patch_pg_20260928_app",
  contract: "records_patch_pg_20260928_contract",
  distinctRecord: "records_patch_pg_20260928_distinct",
  entity: "records_patch_pg_20260928_entity",
  failureRecord: "records_patch_pg_20260928_failure",
  field: "records_patch_pg_20260928_location",
  legacyWebRecord: "records_patch_pg_20260928_legacy_web",
  lostRecord: "records_patch_pg_20260928_lost",
  organization: "records_patch_pg_20260928_org",
  reusedRecord: "records_patch_pg_20260928_reused",
  rollbackRecord: "records_patch_pg_20260928_rollback",
  sameKeyRecord: "records_patch_pg_20260928_same_key",
  user: "records_patch_pg_20260928_user",
} as const;

const operationFor = (recordId: string) =>
  `record:patch:${ids.contract}:${ids.entity}:${recordId}`;

type Entity = NonNullable<Awaited<ReturnType<typeof getApiEntityDefinition>>>;
type HeldLock = {
  pid: number;
  release(): Promise<void>;
};

let entity: Entity;

describePostgres("RECORDS PATCH PostgreSQL concurrency", () => {
  beforeAll(async () => {
    assertLocalDatabaseTarget();
    await assertConnectedDatabaseTarget();
    await cleanup();
    await seed();
    const loaded = await getApiEntityDefinition(ids.contract, ids.entity);
    if (!loaded) throw new Error("Synthetic entity was not created.");
    entity = loaded;
  }, 30000);

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  }, 30000);

  it("serializes equal concurrent commands into one mutation and one replay", async () => {
    const initial = await readRecord(ids.sameKeyRecord);
    const lock = await holdRecordLock(ids.sameKeyRecord);
    const command = patchCommand({
      clientRequestId: "same-key",
      expectedUpdatedAt: initial.updatedAt.toISOString(),
      recordId: ids.sameKeyRecord,
      value: "Taller",
    });
    let firstSettled = false;
    let secondSettled = false;
    const first = patchApiEntityRecord(command).finally(() => {
      firstSettled = true;
    });
    await waitForDirectBlockedBy(lock.pid, 1);
    const second = patchApiEntityRecord(command).finally(() => {
      secondSettled = true;
    });

    await waitForBlockedBy(lock.pid, 2);
    expect(firstSettled).toBe(false);
    expect(secondSettled).toBe(false);
    await lock.release();

    const [firstResponse, secondResponse] = await Promise.all([
      directResponse(first),
      directResponse(second),
    ]);

    expect(firstResponse).toEqual(secondResponse);
    expect(firstResponse.status).toBe(200);
    expect(await recordValue(ids.sameKeyRecord)).toBe("Taller");
    expect(await auditCount(ids.sameKeyRecord)).toBe(1);
    expect(await idempotencyCount(ids.sameKeyRecord)).toBe(1);
  }, 30000);

  it("rejects concurrent reuse of the same key with different content", async () => {
    const initial = await readRecord(ids.reusedRecord);
    const lock = await holdRecordLock(ids.reusedRecord);
    const first = patchApiEntityRecord(patchCommand({
      clientRequestId: "reused-key",
      expectedUpdatedAt: initial.updatedAt.toISOString(),
      recordId: ids.reusedRecord,
      value: "Taller",
    }));

    await waitForDirectBlockedBy(lock.pid, 1);
    const second = patchApiEntityRecord(patchCommand({
      clientRequestId: "reused-key",
      expectedUpdatedAt: initial.updatedAt.toISOString(),
      recordId: ids.reusedRecord,
      value: "Bodega",
    }));
    await waitForBlockedBy(lock.pid, 2);
    await lock.release();

    const accepted = await directResponse(first);
    const rejected = await errorResponse(second);
    expect(accepted.status).toBe(200);
    expect(rejected.status).toBe(409);
    expect(rejected.body).toMatchObject({
      error: { code: "IDEMPOTENCY_KEY_REUSED" },
    });
    expect(await recordValue(ids.reusedRecord)).toBe("Taller");
    expect(await auditCount(ids.reusedRecord)).toBe(1);
    expect(await idempotencyCount(ids.reusedRecord)).toBe(1);
  }, 30000);

  it("accepts only one of two distinct commands based on the same version", async () => {
    const initial = await readRecord(ids.distinctRecord);
    const lock = await holdRecordLock(ids.distinctRecord);
    const first = patchApiEntityRecord(patchCommand({
      clientRequestId: "distinct-a",
      expectedUpdatedAt: initial.updatedAt.toISOString(),
      recordId: ids.distinctRecord,
      value: "Taller",
    }));
    const second = patchApiEntityRecord(patchCommand({
      clientRequestId: "distinct-b",
      expectedUpdatedAt: initial.updatedAt.toISOString(),
      recordId: ids.distinctRecord,
      value: "Bodega",
    }));

    await waitForBlockedBy(lock.pid, 2);
    await lock.release();

    const responses = await Promise.all([directResponse(first), directResponse(second)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const accepted = responses.find((response) => response.status === 200);
    const conflict = responses.find((response) => response.status === 409);
    expect(conflict?.body).toMatchObject({ error: { code: "REMOTE_VERSION_CHANGED" } });
    expect(await recordValue(ids.distinctRecord)).toBe(
      (accepted?.body as PatchSuccessBody).data.record.values.ubicacion,
    );
    expect(await auditCount(ids.distinctRecord)).toBe(1);
    expect(await idempotencyCount(ids.distinctRecord)).toBe(2);
  }, 30000);

  it("replays a lost response and preserves it after a later edit", async () => {
    const initial = await readRecord(ids.lostRecord);
    const firstCommand = patchCommand({
      clientRequestId: "lost-a",
      expectedUpdatedAt: initial.updatedAt.toISOString(),
      recordId: ids.lostRecord,
      value: "Taller",
    });
    const applied = await directResponse(patchApiEntityRecord(firstCommand));
    const appliedVersion = (applied.body as PatchSuccessBody).data.record.updatedAt;

    const retry = await directResponse(patchApiEntityRecord(firstCommand));
    expect(retry).toEqual(applied);
    expect(await auditCount(ids.lostRecord)).toBe(1);

    const later = await directResponse(patchApiEntityRecord(patchCommand({
      clientRequestId: "lost-b",
      expectedUpdatedAt: appliedVersion,
      recordId: ids.lostRecord,
      value: "Bodega",
    })));
    const laterVersion = (later.body as PatchSuccessBody).data.record.updatedAt;
    expect(later.status).toBe(200);
    expect(appliedVersion).not.toBe(initial.updatedAt.toISOString());
    expect(laterVersion).not.toBe(appliedVersion);

    const historicalReplay = await directResponse(patchApiEntityRecord(firstCommand));
    expect(historicalReplay).toEqual(applied);
    expect(await recordValue(ids.lostRecord)).toBe("Bodega");
    expect(await auditCount(ids.lostRecord)).toBe(2);

    const stale = await directResponse(patchApiEntityRecord(patchCommand({
      clientRequestId: "lost-stale",
      expectedUpdatedAt: appliedVersion,
      recordId: ids.lostRecord,
      value: "Patio",
    })));
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: { code: "REMOTE_VERSION_CHANGED" } });
    expect(await recordValue(ids.lostRecord)).toBe("Bodega");
    expect(await auditCount(ids.lostRecord)).toBe(2);
  }, 30000);

  it("serializes legacy PATCH and the Core web writer with last-writer-wins behavior", async () => {
    const lock = await holdRecordLock(ids.legacyWebRecord);
    const completionOrder: string[] = [];
    const legacy = patchApiEntityRecord({
      appId: ids.app,
      body: { values: { ubicacion: "Taller" } },
      contractId: ids.contract,
      entity,
      recordId: ids.legacyWebRecord,
      userId: ids.user,
    }).then((result) => {
      completionOrder.push("Taller");
      return result;
    });

    await waitForBlockedBy(lock.pid, 1);
    const formData = new FormData();
    formData.set(`field_${ids.field}`, "Bodega");
    const web = updateEntityRecord(
      ids.contract,
      ids.entity,
      ids.legacyWebRecord,
      ids.user,
      formData,
    ).then((result) => {
      completionOrder.push("Bodega");
      return result;
    });

    await waitForBlockedBy(lock.pid, 2);
    await lock.release();
    const [legacyResult, webResult] = await Promise.all([legacy, web]);

    expect(legacyResult.ok).toBe(true);
    expect(webResult?.id).toBe(ids.legacyWebRecord);
    expect(completionOrder).toHaveLength(2);
    expect(await recordValue(ids.legacyWebRecord)).toBe(completionOrder.at(-1));
    expect(await auditCount(ids.legacyWebRecord)).toBe(2);
    expect(await idempotencyCount(ids.legacyWebRecord)).toBe(0);
  }, 30000);

  it("lets a waiting equal command execute after the first executor rolls back", async () => {
    const initial = await readRecord(ids.rollbackRecord);
    const recordLock = await holdRecordLock(ids.rollbackRecord);
    const command = patchCommand({
      clientRequestId: "rollback-takeover",
      expectedUpdatedAt: initial.updatedAt.toISOString(),
      recordId: ids.rollbackRecord,
      value: "Taller",
    });
    const first = patchApiEntityRecord(command).then(
      (result) => ({ error: null, result }),
      (error: unknown) => ({ error, result: null }),
    );
    const [firstPid] = await waitForDirectBlockedBy(recordLock.pid, 1);
    let secondSettled = false;
    const second = patchApiEntityRecord(command).finally(() => {
      secondSettled = true;
    });

    await waitForBlockedBy(recordLock.pid, 2);
    await cancelBackend(firstPid.pid);
    const firstOutcome = await first;
    expect(firstOutcome.error).toBeTruthy();
    expect(secondSettled).toBe(false);
    await waitForDirectBlockedBy(recordLock.pid, 1);
    await recordLock.release();

    const completed = await directResponse(second);
    expect(completed.status).toBe(200);
    expect(await recordValue(ids.rollbackRecord)).toBe("Taller");
    expect(await auditCount(ids.rollbackRecord)).toBe(1);
    expect(await idempotencyCount(ids.rollbackRecord)).toBe(1);
  }, 30000);

  it("rolls back a cancelled command and lets an exact later retry complete", async () => {
    const initial = await readRecord(ids.failureRecord);
    const auditLock = await holdAuditTableLock();
    const command = patchCommand({
      clientRequestId: "failure-before-commit",
      expectedUpdatedAt: initial.updatedAt.toISOString(),
      recordId: ids.failureRecord,
      value: "Taller",
    });
    const pending = patchApiEntityRecord(command).then(
      (result) => ({ error: null, result }),
      (error: unknown) => ({ error, result: null }),
    );

    const [executor] = await waitForDirectBlockedBy(auditLock.pid, 1);
    await cancelBackend(executor.pid);
    const outcome = await pending;
    await auditLock.release();

    expect(outcome.error).toBeTruthy();
    expect(await recordValue(ids.failureRecord)).toBe("Original");
    expect((await readRecord(ids.failureRecord)).updatedAt.toISOString()).toBe(
      initial.updatedAt.toISOString(),
    );
    expect(await auditCount(ids.failureRecord)).toBe(0);
    expect(await idempotencyCount(ids.failureRecord)).toBe(0);

    const retry = await directResponse(patchApiEntityRecord(command));
    expect(retry.status).toBe(200);
    expect(await recordValue(ids.failureRecord)).toBe("Taller");
    expect((await readRecord(ids.failureRecord)).updatedAt.toISOString()).not.toBe(
      initial.updatedAt.toISOString(),
    );
    expect(await auditCount(ids.failureRecord)).toBe(1);
    expect(await idempotencyCount(ids.failureRecord)).toBe(1);
  }, 30000);
});

type PatchSuccessBody = {
  data: {
    record: {
      updatedAt: string;
      values: { ubicacion: string };
    };
  };
};

function patchCommand({
  clientRequestId,
  expectedUpdatedAt,
  recordId,
  value,
}: {
  clientRequestId: string;
  expectedUpdatedAt: string;
  recordId: string;
  value: string;
}) {
  return {
    appId: ids.app,
    body: {
      clientRequestId,
      expectedUpdatedAt,
      values: { ubicacion: value },
    },
    contractId: ids.contract,
    entity,
    recordId,
    userId: ids.user,
  };
}

async function directResponse(
  resultPromise: ReturnType<typeof patchApiEntityRecord>,
) {
  const result = await resultPromise;
  if (!("directResponse" in result) || !result.directResponse) {
    throw new Error("Expected a direct idempotent PATCH response.");
  }

  return {
    body: await result.directResponse.json(),
    status: result.directResponse.status,
  };
}

async function errorResponse(
  resultPromise: ReturnType<typeof patchApiEntityRecord>,
) {
  const result = await resultPromise;
  if (result.ok || !("response" in result)) {
    throw new Error("Expected an idempotency error response.");
  }

  return {
    body: await result.response.json(),
    status: result.response.status,
  };
}

async function holdRecordLock(recordId: string) {
  return holdLock(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "EntityRecord"
      WHERE "id" = ${recordId}
        AND "entityTypeId" = ${ids.entity}
      FOR UPDATE
    `);
  });
}

async function holdAuditTableLock() {
  return holdLock(async (tx) => {
    await tx.$executeRaw(Prisma.sql`LOCK TABLE "AuditEvent" IN ACCESS EXCLUSIVE MODE`);
  });
}

async function holdLock(
  acquire: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<HeldLock> {
  const client = new PrismaClient();
  const acquired = deferred<number>();
  const release = deferred<void>();
  const transaction = client.$transaction(async (tx) => {
    const [connection] = await tx.$queryRaw<Array<{ pid: number }>>`
      SELECT pg_backend_pid()::int AS pid
    `;
    await acquire(tx);
    acquired.resolve(connection.pid);
    await release.promise;
  }, { timeout: 30000 });
  const pid = await acquired.promise;

  return {
    pid,
    async release() {
      release.resolve();
      await transaction;
      await client.$disconnect();
    },
  };
}

async function waitForBlockedBy(blockerPid: number, count: number) {
  return waitFor(async () => {
    const pids = await blockedPids(blockerPid);
    return pids.length >= count ? pids : null;
  }, `at least ${count} PostgreSQL sessions blocked by ${blockerPid}`);
}

async function waitForDirectBlockedBy(blockerPid: number, count: number) {
  return waitFor(async () => {
    const pids = await directBlockedPids(blockerPid);
    return pids.length >= count ? pids : null;
  }, `at least ${count} PostgreSQL sessions directly blocked by ${blockerPid}`);
}

async function blockedPids(blockerPid: number) {
  return prisma.$queryRaw<Array<{ pid: number }>>(Prisma.sql`
    WITH RECURSIVE blocked(pid) AS (
      SELECT pid
      FROM pg_stat_activity
      WHERE ${blockerPid} = ANY(pg_blocking_pids(pid))

      UNION

      SELECT activity.pid
      FROM pg_stat_activity activity
      JOIN blocked waiter
        ON waiter.pid = ANY(pg_blocking_pids(activity.pid))
    )
    SELECT DISTINCT pid::int AS pid
    FROM blocked
    ORDER BY pid
  `);
}

function directBlockedPids(blockerPid: number) {
  return prisma.$queryRaw<Array<{ pid: number }>>(Prisma.sql`
    SELECT pid::int AS pid
    FROM pg_stat_activity
    WHERE ${blockerPid} = ANY(pg_blocking_pids(pid))
    ORDER BY pid
  `);
}

async function cancelBackend(pid: number) {
  const [result] = await prisma.$queryRaw<Array<{ cancelled: boolean }>>(
    Prisma.sql`SELECT pg_cancel_backend(${pid}::int) AS cancelled`,
  );
  expect(result.cancelled).toBe(true);
}

async function waitFor<T>(
  read: () => Promise<T | null>,
  description: string,
  timeoutMs = 10000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await read();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for ${description}.`);
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function readRecord(recordId: string) {
  const record = await getApiEntityRecord({ entityType: entity, recordId });
  if (!record) throw new Error(`Synthetic record ${recordId} not found.`);
  return record;
}

async function recordValue(recordId: string) {
  const value = await prisma.entityValue.findUniqueOrThrow({
    where: {
      entityRecordId_entityFieldId: {
        entityFieldId: ids.field,
        entityRecordId: recordId,
      },
    },
  });
  return value.textValue;
}

function auditCount(recordId: string) {
  return prisma.auditEvent.count({
    where: { action: "RECORD_UPDATED", entityRecordId: recordId },
  });
}

function idempotencyCount(recordId: string) {
  return prisma.apiIdempotencyKey.count({
    where: {
      externalAppId: ids.app,
      operation: operationFor(recordId),
    },
  });
}

function assertLocalDatabaseTarget() {
  const configured = process.env.DATABASE_URL;
  if (!configured) throw new Error("DATABASE_URL must be passed explicitly.");
  const url = new URL(configured);

  expect(url.hostname).toBe("127.0.0.1");
  expect(url.port).toBe("5432");
  expect(url.pathname).toBe("/opco_development");
  expect(decodeURIComponent(url.username)).toBe("opco_dev");
}

async function assertConnectedDatabaseTarget() {
  const [target] = await prisma.$queryRaw<Array<{
    database: string;
    host: string;
    port: number;
    username: string;
  }>>`
    SELECT
      current_database() AS database,
      host(inet_server_addr()) AS host,
      inet_server_port()::int AS port,
      current_user AS username
  `;

  expect(target).toEqual({
    database: "opco_development",
    host: "127.0.0.1",
    port: 5432,
    username: "opco_dev",
  });
}

async function seed() {
  await prisma.organization.create({
    data: {
      id: ids.organization,
      name: "RECORDS PATCH PostgreSQL Test",
      slug: ids.organization,
    },
  });
  await prisma.user.create({
    data: {
      email: "records-patch-pg-20260928@example.invalid",
      id: ids.user,
      name: "RECORDS PATCH PostgreSQL Test",
    },
  });
  await prisma.membership.create({
    data: {
      organizationId: ids.organization,
      role: "ADMIN",
      userId: ids.user,
    },
  });
  await prisma.contract.create({
    data: {
      code: "RECORDS-PATCH-PG-20260928",
      id: ids.contract,
      name: "RECORDS PATCH PostgreSQL Test",
      organizationId: ids.organization,
      slug: ids.contract,
    },
  });
  await prisma.externalApp.create({
    data: {
      clientId: ids.app,
      id: ids.app,
      name: "RECORDS PATCH PostgreSQL Test",
      organizationId: ids.organization,
      slug: ids.app,
    },
  });
  await prisma.entityType.create({
    data: {
      contractId: ids.contract,
      id: ids.entity,
      name: "RECORDS PATCH PostgreSQL Test",
      slug: ids.entity,
    },
  });
  await prisma.entityField.create({
    data: {
      config: { display: { primary: true } },
      entityTypeId: ids.entity,
      id: ids.field,
      key: "ubicacion",
      name: "Ubicación",
      required: true,
      type: "TEXT",
    },
  });

  const recordIds = [
    ids.sameKeyRecord,
    ids.distinctRecord,
    ids.lostRecord,
    ids.legacyWebRecord,
    ids.failureRecord,
    ids.rollbackRecord,
    ids.reusedRecord,
  ];
  await prisma.entityRecord.createMany({
    data: recordIds.map((id) => ({
      displayName: "Original",
      entityTypeId: ids.entity,
      id,
    })),
  });
  await prisma.entityValue.createMany({
    data: recordIds.map((entityRecordId) => ({
      entityFieldId: ids.field,
      entityRecordId,
      textValue: "Original",
    })),
  });
}

async function cleanup() {
  await prisma.auditEvent.deleteMany({ where: { contractId: ids.contract } });
  await prisma.apiIdempotencyKey.deleteMany({ where: { contractId: ids.contract } });
  await prisma.organization.deleteMany({ where: { id: ids.organization } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
}
