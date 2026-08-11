-- Remove only the technical status classification from EntityRecord.
-- Existing EntityRecord rows are preserved, including rows that were ACTIVE, INACTIVE, or ARCHIVED.

DROP INDEX IF EXISTS "EntityRecord_entityTypeId_status_idx";

ALTER TABLE "EntityRecord"
  DROP COLUMN IF EXISTS "status",
  DROP COLUMN IF EXISTS "archivedAt";

DROP TYPE IF EXISTS "EntityRecordStatus";
