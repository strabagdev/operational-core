-- EnableExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- AlterTable
ALTER TABLE "ExternalApp" ADD COLUMN "clientId" TEXT;

-- Backfill existing rows with non-secret random identifiers.
UPDATE "ExternalApp"
SET "clientId" = 'opco_app_' || replace(gen_random_uuid()::text, '-', '')
WHERE "clientId" IS NULL;

-- AlterTable
ALTER TABLE "ExternalApp" ALTER COLUMN "clientId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ExternalApp_clientId_key" ON "ExternalApp"("clientId");
