import { Prisma } from "@prisma/client";

export async function lockEntityRecordForUpdate(
  tx: Prisma.TransactionClient,
  recordId: string,
  entityTypeId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "EntityRecord"
    WHERE "id" = ${recordId}
      AND "entityTypeId" = ${entityTypeId}
    FOR UPDATE
  `);

  return rows.length > 0;
}
