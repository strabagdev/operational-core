import { Prisma } from "@prisma/client";

export type LatestByRelationRecord = {
  displayName: string;
  id: string;
  outgoingRelations: Array<{
    sourceFieldId: string;
    targetRecordId: string;
  }>;
  updatedAt: Date;
  values: Array<{
    booleanValue?: boolean | null;
    dateValue?: Date | null;
    decimalValue?: Prisma.Decimal | null;
    entityFieldId: string;
    integerValue?: number | null;
    jsonValue?: Prisma.JsonValue | null;
    textValue?: string | null;
  }>;
};

export function latestByRelationRecords<RecordType extends LatestByRelationRecord>({
  orderFieldId,
  records,
  relationFieldId,
}: {
  orderFieldId?: string;
  records: RecordType[];
  relationFieldId: string;
}) {
  const sorted = orderFieldId
    ? [...records].sort((left, right) => {
        const leftValue = latestByRelationOrderValue(left.values, orderFieldId);
        const rightValue = latestByRelationOrderValue(right.values, orderFieldId);
        const comparison = rightValue.localeCompare(leftValue);

        return comparison === 0 ? left.id.localeCompare(right.id) : comparison;
      })
    : [...records].sort((left, right) => left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id));
  const latestByRelation = new Map<string, RecordType>();

  for (const record of sorted) {
    const relation = record.outgoingRelations.find((item) => item.sourceFieldId === relationFieldId);

    if (relation && !latestByRelation.has(relation.targetRecordId)) {
      latestByRelation.set(relation.targetRecordId, record);
    }
  }

  return Array.from(latestByRelation.values());
}

function latestByRelationOrderValue(values: LatestByRelationRecord["values"], fieldId: string) {
  const value = values.find((item) => item.entityFieldId === fieldId);

  if (!value) return "";
  if (value.dateValue) return value.dateValue.toISOString();
  if (value.integerValue !== null && value.integerValue !== undefined) return String(value.integerValue).padStart(20, "0");
  if (value.decimalValue !== null && value.decimalValue !== undefined) return value.decimalValue.toString().padStart(20, "0");
  if (value.booleanValue !== null && value.booleanValue !== undefined) return value.booleanValue ? "1" : "0";
  if (value.textValue) return value.textValue;

  return "";
}
