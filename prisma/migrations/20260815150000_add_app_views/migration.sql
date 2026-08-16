-- Add configurable client views/experiences scoped to contracts.
CREATE TYPE "AppViewType" AS ENUM ('RECORDS', 'WORKFLOW', 'BOARD', 'DASHBOARD');

CREATE TABLE "AppView" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "icon" TEXT,
  "type" "AppViewType" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "config" JSONB NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AppView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppView_contractId_slug_key" ON "AppView"("contractId", "slug");
CREATE INDEX "AppView_contractId_sortOrder_idx" ON "AppView"("contractId", "sortOrder");

ALTER TABLE "AppView"
ADD CONSTRAINT "AppView_contractId_fkey"
FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
