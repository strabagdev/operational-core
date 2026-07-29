-- CreateEnum
CREATE TYPE "EntityRecordStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "EntityRecord" (
    "id" TEXT NOT NULL,
    "entityTypeId" TEXT NOT NULL,
    "status" "EntityRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "EntityRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityValue" (
    "id" TEXT NOT NULL,
    "entityRecordId" TEXT NOT NULL,
    "entityFieldId" TEXT NOT NULL,
    "textValue" TEXT,
    "integerValue" INTEGER,
    "decimalValue" DECIMAL(20,6),
    "booleanValue" BOOLEAN,
    "dateValue" TIMESTAMP(3),
    "jsonValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntityRecord_entityTypeId_status_idx" ON "EntityRecord"("entityTypeId", "status");

-- CreateIndex
CREATE INDEX "EntityValue_entityFieldId_textValue_idx" ON "EntityValue"("entityFieldId", "textValue");

-- CreateIndex
CREATE INDEX "EntityValue_entityFieldId_integerValue_idx" ON "EntityValue"("entityFieldId", "integerValue");

-- CreateIndex
CREATE INDEX "EntityValue_entityFieldId_decimalValue_idx" ON "EntityValue"("entityFieldId", "decimalValue");

-- CreateIndex
CREATE INDEX "EntityValue_entityFieldId_booleanValue_idx" ON "EntityValue"("entityFieldId", "booleanValue");

-- CreateIndex
CREATE INDEX "EntityValue_entityFieldId_dateValue_idx" ON "EntityValue"("entityFieldId", "dateValue");

-- CreateIndex
CREATE UNIQUE INDEX "EntityValue_entityRecordId_entityFieldId_key" ON "EntityValue"("entityRecordId", "entityFieldId");

-- AddForeignKey
ALTER TABLE "EntityRecord" ADD CONSTRAINT "EntityRecord_entityTypeId_fkey" FOREIGN KEY ("entityTypeId") REFERENCES "EntityType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityValue" ADD CONSTRAINT "EntityValue_entityRecordId_fkey" FOREIGN KEY ("entityRecordId") REFERENCES "EntityRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityValue" ADD CONSTRAINT "EntityValue_entityFieldId_fkey" FOREIGN KEY ("entityFieldId") REFERENCES "EntityField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
