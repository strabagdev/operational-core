import type { EntityFieldType, Prisma } from "@prisma/client";

export type PrimaryDisplayFieldCandidate = {
  type: EntityFieldType;
  config?: Prisma.JsonValue | null;
  relationKind?: "ONE" | "MANY";
  targetEntityTypeId?: string | null;
};

export const scalarPrimaryDisplayFieldTypes = new Set<EntityFieldType>([
  "TEXT",
  "EMAIL",
  "PHONE",
  "URL",
  "INTEGER",
  "SELECT",
]);

export function supportsPrimaryDisplayField(field: PrimaryDisplayFieldCandidate) {
  if (scalarPrimaryDisplayFieldTypes.has(field.type)) {
    return true;
  }

  if (field.type !== "RELATION") {
    return false;
  }

  const relation = readRelationDisplayConfig(field);

  return relation.relationKind === "ONE" && Boolean(relation.targetEntityTypeId);
}

function readRelationDisplayConfig(field: PrimaryDisplayFieldCandidate) {
  const flatConfig = objectConfig(field.config);
  const nestedConfig = objectConfig(flatConfig.relation);

  return {
    relationKind:
      field.relationKind ??
      relationKind(flatConfig.relationKind) ??
      relationKind(nestedConfig.relationKind) ??
      "ONE",
    targetEntityTypeId:
      field.targetEntityTypeId ??
      stringValue(flatConfig.targetEntityTypeId) ??
      stringValue(nestedConfig.targetEntityTypeId),
  };
}

function objectConfig(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function relationKind(value: unknown) {
  return value === "ONE" || value === "MANY" ? value : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}
