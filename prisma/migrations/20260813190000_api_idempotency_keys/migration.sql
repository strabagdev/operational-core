-- CreateTable
CREATE TABLE "ApiIdempotencyKey" (
    "id" TEXT NOT NULL,
    "externalAppId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "entityTypeId" TEXT NOT NULL,
    "entityRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiIdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiIdempotencyKey_externalAppId_operation_clientRequestId_key" ON "ApiIdempotencyKey"("externalAppId", "operation", "clientRequestId");

-- CreateIndex
CREATE INDEX "ApiIdempotencyKey_entityRecordId_idx" ON "ApiIdempotencyKey"("entityRecordId");

-- AddForeignKey
ALTER TABLE "ApiIdempotencyKey" ADD CONSTRAINT "ApiIdempotencyKey_externalAppId_fkey" FOREIGN KEY ("externalAppId") REFERENCES "ExternalApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiIdempotencyKey" ADD CONSTRAINT "ApiIdempotencyKey_entityRecordId_fkey" FOREIGN KEY ("entityRecordId") REFERENCES "EntityRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
