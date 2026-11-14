import { Prisma } from "@prisma/client";

export const OFFLINE_REVISION_TABLES = ["EntityType", "EntityRecord", "EntityValue", "EntityRelation", "StateUpdateIdentityDefinition", "StateUpdateIdentitySlot"] as const;
export const OFFLINE_REVISION_TRIGGER_COUNT = OFFLINE_REVISION_TABLES.length * 4 + 1;

/** Attestation of installed DML tracking, not permission to reuse an offline copy. */
export async function readOfflineRevisionCatalog(tx: Prisma.TransactionClient) {
  const [epoch] = await tx.$queryRaw<Array<{version:number;epoch:string;coverageSignature:string;readOnly:string;isolation:string}>>`
    SELECT version, epoch, "coverageSignature", current_setting('transaction_read_only') AS "readOnly", current_setting('transaction_isolation') AS isolation FROM "OfflineRevisionEpoch" WHERE id='v1'`;
  if (epoch && (epoch.readOnly !== "on" || epoch.isolation !== "repeatable read")) throw new Error("OFFLINE_MANIFEST_SNAPSHOT_REQUIRED");
  if (!epoch || epoch.version !== 1) throw new Error("OFFLINE_REVISION_UNAVAILABLE");
  const [catalog] = await tx.$queryRaw<Array<{signature:string}>>(Prisma.sql`WITH parts AS (
  SELECT 'trigger:' || c.relname || ':' || t.tgname || ':' || t.tgenabled::text || ':' || pg_get_triggerdef(t.oid) AS value
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname=current_schema() AND t.tgname LIKE 'opco_offline_revision_%'
  UNION ALL
  SELECT 'function:' || p.proname || ':' || pg_get_function_identity_arguments(p.oid) || ':' || p.prosrc || ':' || p.prosecdef::text || ':' || COALESCE(p.proconfig::text, '') AS value
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname=current_schema() AND p.proname IN ('opco_offline_revision_touch', 'opco_offline_revision_track', 'opco_offline_revision_flush')
)
SELECT md5(string_agg(value, E'\n' ORDER BY value)) AS signature FROM parts`);
  const [count] = await tx.$queryRaw<Array<{total:bigint;enabled:bigint}>>`
    SELECT count(*) AS total, count(*) FILTER (WHERE t.tgenabled='A') AS enabled
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=current_schema() AND t.tgname LIKE 'opco_offline_revision_%'`;
  const intact = catalog?.signature === epoch.coverageSignature && Number(count?.total) === OFFLINE_REVISION_TRIGGER_COUNT && Number(count?.enabled) === OFFLINE_REVISION_TRIGGER_COUNT;
  return { epoch: epoch.epoch, attestationHash: catalog?.signature ?? null, tracking: intact ? "installed" as const : "incomplete" as const };
}

export async function readOfflineEntityRevisions(tx: Prisma.TransactionClient, contractId: string) {
  return tx.$queryRaw<Array<{entityTypeId:string;dataRevision:string}>>`
    SELECT "entityTypeId", "dataRevision"::text AS "dataRevision" FROM "OfflineEntityRevision"
    WHERE "contractId"=${contractId} ORDER BY "entityTypeId"`;
}
