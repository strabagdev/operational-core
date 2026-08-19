import { Prisma, type EntityFieldType, type EntityNature } from "@prisma/client";

import { dateOnlyInputValue } from "@/lib/date-only";
import { orderEntityFields } from "@/lib/entity-field-order";
import { getRelationConfig, parseFieldConfig } from "@/lib/field-validation";

type ApiEntityType = {
  icon?: string | null;
  id: string;
  isActive: boolean;
  name: string;
  nature?: EntityNature;
  slug: string;
};

type ApiFieldOption = {
  active: boolean;
  id: string;
  label: string;
  order: number;
  value: string;
};

type ApiFieldOptionInput = {
  id: string;
  isActive: boolean;
  label: string;
  sortOrder: number;
  value: string;
};

type ApiEntityField = {
  active: boolean;
  config: {
    defaultValue?: Prisma.JsonValue;
    display: ReturnType<typeof parseFieldConfig>["display"];
    money?: ReturnType<typeof parseFieldConfig>["money"];
    relation?: {
      relationKind: "ONE" | "MANY";
      targetEntityTypeId?: string;
    };
    validation: ReturnType<typeof parseFieldConfig>["validation"];
  };
  id: string;
  key: string;
  multiple: boolean;
  name: string;
  options?: ApiFieldOption[];
  order: number;
  required: boolean;
  searchable: boolean;
  type: EntityFieldType;
  unique: boolean;
};

type ApiFieldValue = {
  booleanValue?: boolean | null;
  dateValue?: Date | null;
  decimalValue?: Prisma.Decimal | null;
  entityFieldId: string;
  integerValue?: number | null;
  jsonValue?: Prisma.JsonValue | null;
  textValue?: string | null;
};

type ApiRelation = {
  sourceFieldId: string;
  targetRecord: {
    displayName: string;
    entityTypeId: string;
    id: string;
  };
  targetRecordId: string;
};

type ApiRecord = {
  displayName: string;
  id: string;
  outgoingRelations?: ApiRelation[];
  updatedAt: Date;
  values: ApiFieldValue[];
};

export function serializeApiEntitySummary(entityType: ApiEntityType) {
  return {
    active: entityType.isActive,
    icon: entityType.icon ?? null,
    id: entityType.id,
    name: entityType.name,
    nature: entityType.nature ?? "MASTER",
    slug: entityType.slug,
  };
}

export function serializeApiEntityDefinition(entityType: ApiEntityType & {
  fields: ApiEntityFieldInput[];
}) {
  return {
    ...serializeApiEntitySummary(entityType),
    fields: orderEntityFields(entityType.fields)
      .filter((field) => field.isActive)
      .map(serializeApiEntityField),
  };
}

type ApiEntityFieldInput = {
  config: Prisma.JsonValue | null;
  id: string;
  isActive: boolean;
  isUnique: boolean;
  key: string;
  multiple: boolean;
  name: string;
  options: ApiFieldOptionInput[];
  required: boolean;
  searchable: boolean;
  sortOrder: number;
  type: EntityFieldType;
};

export function serializeApiEntityField(field: ApiEntityFieldInput): ApiEntityField {
  const parsedConfig = parseFieldConfig(field.config);
  const relation = field.type === "RELATION" ? getRelationConfig(field.config) : undefined;

  return {
    active: field.isActive,
    config: {
      ...(parsedConfig.defaultValue === undefined
        ? {}
        : { defaultValue: parsedConfig.defaultValue }),
      display: parsedConfig.display,
      ...(field.type === "MONEY" ? { money: parsedConfig.money } : {}),
      ...(relation ? {
        relation: {
          relationKind: relation.relationKind ?? "ONE",
          targetEntityTypeId: relation.targetEntityTypeId,
        },
      } : {}),
      validation: parsedConfig.validation,
    },
    id: field.id,
    key: field.key,
    multiple: field.multiple,
    name: field.name,
    ...(field.type === "SELECT" || field.type === "MULTISELECT"
      ? { options: field.options.map(serializeApiFieldOption) }
      : {}),
    order: field.sortOrder,
    required: field.required,
    searchable: field.searchable,
    type: field.type,
    unique: field.isUnique,
  };
}

function serializeApiFieldOption(option: ApiFieldOptionInput) {
  return {
    active: option.isActive,
    id: option.id,
    label: option.label,
    order: option.sortOrder,
    value: option.value,
  };
}

export function serializeApiEntityRecord({
  fields,
  record,
}: {
  fields: ApiEntityFieldInput[];
  record: ApiRecord;
}) {
  const activeFields = orderEntityFields(fields).filter((field) => field.isActive);
  const valuesByFieldId = new Map(record.values.map((value) => [value.entityFieldId, value]));
  const relationsByFieldId = groupRelations(record.outgoingRelations ?? []);

  return {
    displayName: record.displayName,
    id: record.id,
    updatedAt: record.updatedAt.toISOString(),
    values: Object.fromEntries(
      activeFields.map((field) => [
        field.key,
        serializeApiFieldValue({
          field,
          relations: relationsByFieldId.get(field.id) ?? [],
          value: valuesByFieldId.get(field.id),
        }),
      ]),
    ),
  };
}

function groupRelations(relations: ApiRelation[]) {
  const grouped = new Map<string, ApiRelation[]>();

  for (const relation of relations) {
    const current = grouped.get(relation.sourceFieldId) ?? [];
    current.push(relation);
    grouped.set(relation.sourceFieldId, current);
  }

  return grouped;
}

function serializeApiFieldValue({
  field,
  relations,
  value,
}: {
  field: ApiEntityFieldInput;
  relations: ApiRelation[];
  value?: ApiFieldValue;
}) {
  if (field.type === "RELATION") {
    const serialized = relations.map((relation) => ({
      displayName: relation.targetRecord.displayName,
      entityTypeId: relation.targetRecord.entityTypeId,
      id: relation.targetRecordId,
    }));
    const relationConfig = getRelationConfig(field.config);

    return field.multiple || relationConfig.relationKind === "MANY"
      ? serialized
      : serialized[0] ?? null;
  }

  if (!value) {
    return emptyApiValue(field.type);
  }

  if (
    field.type === "TEXT" ||
    field.type === "TEXTAREA" ||
    field.type === "EMAIL" ||
    field.type === "PHONE" ||
    field.type === "URL" ||
    field.type === "TIME" ||
    field.type === "SELECT"
  ) {
    return value.textValue ?? null;
  }

  if (field.type === "INTEGER") {
    return value.integerValue ?? null;
  }

  if (field.type === "DECIMAL" || field.type === "MONEY") {
    return value.decimalValue?.toString() ?? null;
  }

  if (field.type === "BOOLEAN") {
    return value.booleanValue ?? null;
  }

  if (field.type === "DATE") {
    return value.dateValue ? dateOnlyInputValue(value.dateValue) : null;
  }

  if (field.type === "DATETIME") {
    return value.dateValue?.toISOString() ?? null;
  }

  if (field.type === "MULTISELECT") {
    return Array.isArray(value.jsonValue) ? value.jsonValue : [];
  }

  return value.jsonValue ?? null;
}

function emptyApiValue(type: EntityFieldType) {
  if (type === "MULTISELECT") {
    return [];
  }

  return null;
}
