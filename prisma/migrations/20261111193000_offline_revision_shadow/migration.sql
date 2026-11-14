-- Diagnostic revisions only. No business data, identities or existing timestamps are rewritten.
-- No foreign keys: revision tombstones must survive entity/contract deletion.
BEGIN;
LOCK TABLE "EntityType", "EntityRecord", "EntityValue", "EntityRelation", "StateUpdateIdentityDefinition", "StateUpdateIdentitySlot" IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE "OfflineRevisionEpoch" (
  "id" TEXT PRIMARY KEY,
  "version" INTEGER NOT NULL,
  "epoch" TEXT NOT NULL,
  "coverageSignature" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "OfflineEntityRevision" (
  "contractId" TEXT NOT NULL,
  "entityTypeId" TEXT NOT NULL,
  "dataRevision" BIGINT NOT NULL DEFAULT 0 CHECK ("dataRevision" >= 0),
  PRIMARY KEY ("contractId", "entityTypeId")
);
CREATE INDEX "OfflineEntityRevision_entityTypeId_idx" ON "OfflineEntityRevision"("entityTypeId");

-- Transaction-private queue: writers do not lock shared revision rows while business writes run.
-- Deferred flush acquires all revision keys in one stable order at commit.
CREATE TABLE "OfflineRevisionPending" (
  "transactionId" BIGINT NOT NULL,
  "contractId" TEXT NOT NULL,
  "entityTypeId" TEXT NOT NULL,
  "increments" BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY ("transactionId", "contractId", "entityTypeId")
);
CREATE FUNCTION opco_offline_revision_flush() RETURNS TRIGGER
LANGUAGE plpgsql AS $body$
BEGIN
  EXECUTE format('INSERT INTO %1$I."OfflineEntityRevision" ("contractId", "entityTypeId", "dataRevision")
    SELECT "contractId", "entityTypeId", "increments" FROM %1$I."OfflineRevisionPending"
    WHERE "transactionId"=txid_current() ORDER BY "contractId", "entityTypeId"
    ON CONFLICT ("contractId", "entityTypeId") DO UPDATE
      SET "dataRevision" = %1$I."OfflineEntityRevision"."dataRevision" + excluded."dataRevision"', TG_TABLE_SCHEMA);
  EXECUTE format('DELETE FROM %I."OfflineRevisionPending" WHERE "transactionId"=txid_current()', TG_TABLE_SCHEMA);
  RETURN NULL;
END;
$body$;
CREATE CONSTRAINT TRIGGER opco_offline_revision_flush_pending
AFTER INSERT ON "OfflineRevisionPending" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION opco_offline_revision_flush();
ALTER TABLE "OfflineRevisionPending" ENABLE ALWAYS TRIGGER opco_offline_revision_flush_pending;

CREATE FUNCTION opco_offline_revision_touch(p_schema TEXT, p_entities TEXT[]) RETURNS VOID
LANGUAGE plpgsql AS $body$
BEGIN
  IF p_entities IS NULL OR cardinality(p_entities) = 0 THEN RETURN; END IF;
  -- Existing registrations preserve the contract when a parent has already been deleted.
  -- Include both registrations on a cross-contract move (conservative invalidation).
  EXECUTE format('INSERT INTO %1$I."OfflineRevisionPending" ("transactionId", "contractId", "entityTypeId", "increments")
    SELECT DISTINCT txid_current(), "contractId", "entityTypeId", 1 FROM (
      SELECT "contractId", id AS "entityTypeId" FROM %1$I."EntityType" WHERE id = ANY($1)
      UNION SELECT "contractId", "entityTypeId" FROM %1$I."OfflineEntityRevision" WHERE "entityTypeId" = ANY($1)
      UNION SELECT "contractId", "entityTypeId" FROM %1$I."OfflineRevisionPending" WHERE "transactionId"=txid_current() AND "entityTypeId"=ANY($1)
    ) s ORDER BY "contractId", "entityTypeId"
    ON CONFLICT ("transactionId", "contractId", "entityTypeId") DO UPDATE
    SET "increments" = %1$I."OfflineRevisionPending"."increments" + 1', p_schema) USING p_entities;
END;
$body$;

CREATE FUNCTION opco_offline_revision_track() RETURNS TRIGGER
LANGUAGE plpgsql AS $body$
DECLARE rows_query TEXT; entities TEXT[];
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    -- No transition rows exist for TRUNCATE. A wide invalidation is safe, never a false unchanged.
    EXECUTE format('INSERT INTO %1$I."OfflineRevisionPending" ("transactionId", "contractId", "entityTypeId", "increments")
      SELECT txid_current(), "contractId", "entityTypeId", 1 FROM (
        SELECT "contractId", id AS "entityTypeId" FROM %1$I."EntityType"
        UNION SELECT "contractId", "entityTypeId" FROM %1$I."OfflineEntityRevision"
        UNION SELECT "contractId", "entityTypeId" FROM %1$I."OfflineRevisionPending" WHERE "transactionId"=txid_current()
      ) s ORDER BY "contractId", "entityTypeId"
      ON CONFLICT ("transactionId", "contractId", "entityTypeId") DO UPDATE SET "increments" = "OfflineRevisionPending"."increments" + 1', TG_TABLE_SCHEMA);
    RETURN NULL;
  END IF;
  rows_query := CASE TG_OP WHEN 'INSERT' THEN 'SELECT * FROM new_rows'
    WHEN 'DELETE' THEN 'SELECT * FROM old_rows'
    ELSE 'SELECT * FROM old_rows UNION ALL SELECT * FROM new_rows' END;
  IF TG_TABLE_NAME = 'EntityType' THEN
    EXECUTE format('INSERT INTO %I."OfflineRevisionPending" ("transactionId", "contractId", "entityTypeId", "increments")
      SELECT DISTINCT txid_current(), "contractId", id, 1 FROM (%s) r ORDER BY "contractId", id
      ON CONFLICT ("transactionId", "contractId", "entityTypeId") DO UPDATE SET "increments" = "OfflineRevisionPending"."increments" + 1', TG_TABLE_SCHEMA, rows_query);
    RETURN NULL;
  ELSIF TG_TABLE_NAME = 'EntityRecord' THEN
    EXECUTE format('SELECT array_agg(DISTINCT "entityTypeId") FROM (%s) r', rows_query) INTO entities;
  ELSIF TG_TABLE_NAME = 'EntityValue' THEN
    EXECUTE format('SELECT array_agg(DISTINCT e."entityTypeId") FROM (%s) r JOIN %I."EntityRecord" e ON e.id = r."entityRecordId"', rows_query, TG_TABLE_SCHEMA) INTO entities;
  ELSIF TG_TABLE_NAME = 'EntityRelation' THEN
    EXECUTE format('SELECT array_agg(DISTINCT e."entityTypeId") FROM (%s) r JOIN %I."EntityRecord" e ON e.id = r."sourceRecordId"', rows_query, TG_TABLE_SCHEMA) INTO entities;
  ELSIF TG_TABLE_NAME = 'StateUpdateIdentityDefinition' THEN
    EXECUTE format('SELECT array_agg(DISTINCT "targetEntityTypeId") FROM (%s) r', rows_query) INTO entities;
  ELSIF TG_TABLE_NAME = 'StateUpdateIdentitySlot' THEN
    EXECUTE format('SELECT array_agg(DISTINCT d."targetEntityTypeId") FROM (%s) r JOIN %I."StateUpdateIdentityDefinition" d ON d.id = r."definitionId"', rows_query, TG_TABLE_SCHEMA) INTO entities;
  ELSE
    RAISE EXCEPTION 'Unsupported offline revision source';
  END IF;
  EXECUTE format('SELECT %I.opco_offline_revision_touch($1, $2)', TG_TABLE_SCHEMA) USING TG_TABLE_SCHEMA, entities;
  RETURN NULL;
END;
$body$;
CREATE TRIGGER "opco_offline_revision_entitytype_insert" AFTER INSERT ON "EntityType" REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "EntityType" ENABLE ALWAYS TRIGGER "opco_offline_revision_entitytype_insert";
CREATE TRIGGER "opco_offline_revision_entitytype_update" AFTER UPDATE ON "EntityType" REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "EntityType" ENABLE ALWAYS TRIGGER "opco_offline_revision_entitytype_update";
CREATE TRIGGER "opco_offline_revision_entitytype_delete" AFTER DELETE ON "EntityType" REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "EntityType" ENABLE ALWAYS TRIGGER "opco_offline_revision_entitytype_delete";
CREATE TRIGGER "opco_offline_revision_entitytype_truncate" AFTER TRUNCATE ON "EntityType"  FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "EntityType" ENABLE ALWAYS TRIGGER "opco_offline_revision_entitytype_truncate";
CREATE TRIGGER "opco_offline_revision_entityrecord_insert" AFTER INSERT ON "EntityRecord" REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "EntityRecord" ENABLE ALWAYS TRIGGER "opco_offline_revision_entityrecord_insert";
CREATE TRIGGER "opco_offline_revision_entityrecord_update" AFTER UPDATE ON "EntityRecord" REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "EntityRecord" ENABLE ALWAYS TRIGGER "opco_offline_revision_entityrecord_update";
CREATE TRIGGER "opco_offline_revision_entityrecord_delete" AFTER DELETE ON "EntityRecord" REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "EntityRecord" ENABLE ALWAYS TRIGGER "opco_offline_revision_entityrecord_delete";
CREATE TRIGGER "opco_offline_revision_entityrecord_truncate" AFTER TRUNCATE ON "EntityRecord"  FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "EntityRecord" ENABLE ALWAYS TRIGGER "opco_offline_revision_entityrecord_truncate";
CREATE TRIGGER "opco_offline_revision_entityvalue_insert" AFTER INSERT ON "EntityValue" REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "EntityValue" ENABLE ALWAYS TRIGGER "opco_offline_revision_entityvalue_insert";
CREATE TRIGGER "opco_offline_revision_entityvalue_update" AFTER UPDATE ON "EntityValue" REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "EntityValue" ENABLE ALWAYS TRIGGER "opco_offline_revision_entityvalue_update";
CREATE TRIGGER "opco_offline_revision_entityvalue_delete" AFTER DELETE ON "EntityValue" REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "EntityValue" ENABLE ALWAYS TRIGGER "opco_offline_revision_entityvalue_delete";
CREATE TRIGGER "opco_offline_revision_entityvalue_truncate" AFTER TRUNCATE ON "EntityValue"  FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "EntityValue" ENABLE ALWAYS TRIGGER "opco_offline_revision_entityvalue_truncate";
CREATE TRIGGER "opco_offline_revision_entityrelation_insert" AFTER INSERT ON "EntityRelation" REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "EntityRelation" ENABLE ALWAYS TRIGGER "opco_offline_revision_entityrelation_insert";
CREATE TRIGGER "opco_offline_revision_entityrelation_update" AFTER UPDATE ON "EntityRelation" REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "EntityRelation" ENABLE ALWAYS TRIGGER "opco_offline_revision_entityrelation_update";
CREATE TRIGGER "opco_offline_revision_entityrelation_delete" AFTER DELETE ON "EntityRelation" REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "EntityRelation" ENABLE ALWAYS TRIGGER "opco_offline_revision_entityrelation_delete";
CREATE TRIGGER "opco_offline_revision_entityrelation_truncate" AFTER TRUNCATE ON "EntityRelation"  FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "EntityRelation" ENABLE ALWAYS TRIGGER "opco_offline_revision_entityrelation_truncate";
CREATE TRIGGER "opco_offline_revision_stateupdateidentitydefinition_insert" AFTER INSERT ON "StateUpdateIdentityDefinition" REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "StateUpdateIdentityDefinition" ENABLE ALWAYS TRIGGER "opco_offline_revision_stateupdateidentitydefinition_insert";
CREATE TRIGGER "opco_offline_revision_stateupdateidentitydefinition_update" AFTER UPDATE ON "StateUpdateIdentityDefinition" REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "StateUpdateIdentityDefinition" ENABLE ALWAYS TRIGGER "opco_offline_revision_stateupdateidentitydefinition_update";
CREATE TRIGGER "opco_offline_revision_stateupdateidentitydefinition_delete" AFTER DELETE ON "StateUpdateIdentityDefinition" REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "StateUpdateIdentityDefinition" ENABLE ALWAYS TRIGGER "opco_offline_revision_stateupdateidentitydefinition_delete";
CREATE TRIGGER "opco_offline_revision_stateupdateidentitydefinition_truncate" AFTER TRUNCATE ON "StateUpdateIdentityDefinition"  FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "StateUpdateIdentityDefinition" ENABLE ALWAYS TRIGGER "opco_offline_revision_stateupdateidentitydefinition_truncate";
CREATE TRIGGER "opco_offline_revision_stateupdateidentityslot_insert" AFTER INSERT ON "StateUpdateIdentitySlot" REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "StateUpdateIdentitySlot" ENABLE ALWAYS TRIGGER "opco_offline_revision_stateupdateidentityslot_insert";
CREATE TRIGGER "opco_offline_revision_stateupdateidentityslot_update" AFTER UPDATE ON "StateUpdateIdentitySlot" REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "StateUpdateIdentitySlot" ENABLE ALWAYS TRIGGER "opco_offline_revision_stateupdateidentityslot_update";
CREATE TRIGGER "opco_offline_revision_stateupdateidentityslot_delete" AFTER DELETE ON "StateUpdateIdentitySlot" REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "StateUpdateIdentitySlot" ENABLE ALWAYS TRIGGER "opco_offline_revision_stateupdateidentityslot_delete";
CREATE TRIGGER "opco_offline_revision_stateupdateidentityslot_truncate" AFTER TRUNCATE ON "StateUpdateIdentitySlot"  FOR EACH STATEMENT EXECUTE FUNCTION opco_offline_revision_track();
ALTER TABLE "StateUpdateIdentitySlot" ENABLE ALWAYS TRIGGER "opco_offline_revision_stateupdateidentityslot_truncate";

-- Install and seed in one transaction while writers are locked. Existing business rows stay intact.
INSERT INTO "OfflineEntityRevision" ("contractId", "entityTypeId", "dataRevision")
SELECT "contractId", id, 0 FROM "EntityType" ON CONFLICT DO NOTHING;
INSERT INTO "OfflineRevisionEpoch" (id,version,epoch,"coverageSignature")
SELECT 'v1', 1, md5(random()::text || clock_timestamp()::text), signature FROM (WITH parts AS (
  SELECT 'trigger:' || c.relname || ':' || t.tgname || ':' || t.tgenabled::text || ':' || pg_get_triggerdef(t.oid) AS value
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname=current_schema() AND t.tgname LIKE 'opco_offline_revision_%'
  UNION ALL
  SELECT 'function:' || p.proname || ':' || pg_get_function_identity_arguments(p.oid) || ':' || p.prosrc || ':' || p.prosecdef::text || ':' || COALESCE(p.proconfig::text, '') AS value
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname=current_schema() AND p.proname IN ('opco_offline_revision_touch', 'opco_offline_revision_track', 'opco_offline_revision_flush')
)
SELECT md5(string_agg(value, E'\n' ORDER BY value)) AS signature FROM parts) c;
COMMIT;
