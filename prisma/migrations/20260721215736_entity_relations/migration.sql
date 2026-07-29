-- CreateTable
CREATE TABLE "EntityRelation" (
    "id" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "sourceFieldId" TEXT NOT NULL,
    "targetRecordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntityRelation_sourceFieldId_idx" ON "EntityRelation"("sourceFieldId");

-- CreateIndex
CREATE INDEX "EntityRelation_targetRecordId_idx" ON "EntityRelation"("targetRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityRelation_sourceRecordId_sourceFieldId_targetRecordId_key" ON "EntityRelation"("sourceRecordId", "sourceFieldId", "targetRecordId");

-- AddForeignKey
ALTER TABLE "EntityRelation" ADD CONSTRAINT "EntityRelation_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "EntityRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityRelation" ADD CONSTRAINT "EntityRelation_sourceFieldId_fkey" FOREIGN KEY ("sourceFieldId") REFERENCES "EntityField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityRelation" ADD CONSTRAINT "EntityRelation_targetRecordId_fkey" FOREIGN KEY ("targetRecordId") REFERENCES "EntityRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
