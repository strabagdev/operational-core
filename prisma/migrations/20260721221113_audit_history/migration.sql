-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('RECORD_CREATED', 'RECORD_UPDATED', 'RECORD_STATUS_CHANGED', 'RECORD_ARCHIVED', 'VALUE_CHANGED', 'RELATION_ADDED', 'RELATION_REMOVED');

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "entityTypeId" TEXT,
    "entityRecordId" TEXT,
    "actorUserId" TEXT,
    "action" "AuditAction" NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditChange" (
    "id" TEXT NOT NULL,
    "auditEventId" TEXT NOT NULL,
    "entityFieldId" TEXT,
    "fieldName" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,

    CONSTRAINT "AuditChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEvent_contractId_createdAt_idx" ON "AuditEvent"("contractId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityRecordId_createdAt_idx" ON "AuditEvent"("entityRecordId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_entityTypeId_fkey" FOREIGN KEY ("entityTypeId") REFERENCES "EntityType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_entityRecordId_fkey" FOREIGN KEY ("entityRecordId") REFERENCES "EntityRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditChange" ADD CONSTRAINT "AuditChange_auditEventId_fkey" FOREIGN KEY ("auditEventId") REFERENCES "AuditEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditChange" ADD CONSTRAINT "AuditChange_entityFieldId_fkey" FOREIGN KEY ("entityFieldId") REFERENCES "EntityField"("id") ON DELETE SET NULL ON UPDATE CASCADE;
