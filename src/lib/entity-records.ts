import { Prisma, type EntityField, type EntityFieldType } from "@prisma/client";

import {
  buildRelationChanges,
  buildValueChanges,
  createAuditEvent,
} from "@/lib/audit";
import { getAuthorizedContract } from "@/lib/contracts";
import { formatDateOnly } from "@/lib/date-only";
import { orderEntityFields } from "@/lib/entity-field-order";
import {
  FieldValidationError,
  getRelationConfig,
  getPrimaryDisplayField,
  getRecordDisplayName,
  getRecordListFields,
  isEmptySerializedValue,
  normalizeRawFieldValue,
  parseFieldConfig,
  validateRecordValues,
  validateRelationInputs,
  type RelationInput,
  type SerializedFieldValue,
} from "@/lib/field-validation";
import { formatMoneyValue, getMoneyConfig } from "@/lib/money";
import { prisma } from "@/lib/prisma";

type FieldWithOptions = EntityField & {
  options: Array<{
    id: string;
    label: string;
    value: string;
    sortOrder: number;
    isActive: boolean;
  }>;
};

type ValueInput = SerializedFieldValue;
export type EntityRecordSortDirection = "asc" | "desc";
export type EntityRecordSortKey = "displayName" | "updatedAt" | `field:${string}`;
export type EntityRecordSort = {
  key: EntityRecordSortKey;
  direction: EntityRecordSortDirection;
};

export async function getRecordEntityTypes(contractId: string, userId: string) {
  const contract = await getAuthorizedContract(contractId, userId);

  if (!contract) {
    return null;
  }

  const entityTypes = await prisma.entityType.findMany({
    where: {
      contractId: contract.id,
      isActive: true,
    },
    include: {
      _count: {
        select: {
          records: true,
        },
      },
      records: {
        select: {
          id: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return { contract, entityTypes };
}

export async function getAuthorizedRecordEntityType(
  contractId: string,
  entityTypeId: string,
  userId: string,
) {
  const contract = await getAuthorizedContract(contractId, userId);

  if (!contract) {
    return null;
  }

  const entityType = await prisma.entityType.findFirst({
    where: {
      id: entityTypeId,
      contractId: contract.id,
      isActive: true,
    },
    include: {
      fields: {
        where: { isActive: true },
        include: {
          options: {
            orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
          },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      },
    },
  });

  if (!entityType) {
    return null;
  }

  return { contract, entityType };
}

export async function getEntityRecords({
  contractId,
  entityTypeId,
  page = 1,
  pageSize = 50,
  userId,
  query,
  sort,
}: {
  contractId: string;
  entityTypeId: string;
  page?: number;
  pageSize?: number;
  userId: string;
  query?: string;
  sort?: {
    key?: string;
    direction?: string;
  };
}) {
  const authorized = await getAuthorizedRecordEntityType(
    contractId,
    entityTypeId,
    userId,
  );

  if (!authorized) {
    return null;
  }

  const orderedFields = orderEntityFields(authorized.entityType.fields);
  const listFields = getRecordListFields(orderedFields);
  const listFieldIds = new Set(listFields.map((field) => field.id));
  const normalizedPage = Math.max(1, page);
  const normalizedPageSize = clampPageSize(pageSize);
  const neededValueFieldIds = Array.from(listFieldIds);
  const resolvedSort = resolveEntityRecordSort({
    fields: orderedFields,
    listFields,
    sortKey: sort?.key,
    direction: sort?.direction,
  });
  const recordWhere = buildEntityRecordSearchWhere({
    entityTypeId: authorized.entityType.id,
    fields: orderedFields,
    query,
  });
  const totalRecords = await prisma.entityRecord.count({ where: recordWhere });
  const include = entityRecordListInclude(neededValueFieldIds);
  const skip = (normalizedPage - 1) * normalizedPageSize;
  const records = resolvedSort.field
    ? await findRecordsSortedByField({
        entityTypeId: authorized.entityType.id,
        fields: orderedFields,
        field: resolvedSort.field,
        include,
        pageSize: normalizedPageSize,
        query,
        skip,
        sort: resolvedSort,
      })
    : await prisma.entityRecord.findMany({
        where: recordWhere,
        include,
        orderBy: entityRecordOrderBy(resolvedSort),
        skip,
        take: normalizedPageSize,
      });

  return {
    ...authorized,
    entityType: {
      ...authorized.entityType,
      fields: orderedFields,
    },
    pagination: {
      page: normalizedPage,
      pageSize: normalizedPageSize,
      totalRecords,
      totalPages: Math.max(1, Math.ceil(totalRecords / normalizedPageSize)),
    },
    sort: resolvedSort.explicit ? {
      key: resolvedSort.key,
      direction: resolvedSort.direction,
    } : null,
    records,
  };
}

function entityRecordListInclude(neededValueFieldIds: string[]) {
  return {
    outgoingRelations: {
      include: {
        targetRecord: {
          select: {
            displayName: true,
            entityTypeId: true,
            id: true,
          },
        },
      },
      orderBy: { targetRecord: { displayName: "asc" } },
      where:
        neededValueFieldIds.length > 0
          ? { sourceFieldId: { in: neededValueFieldIds } }
          : undefined,
    },
    values: {
      where:
        neededValueFieldIds.length > 0
          ? { entityFieldId: { in: neededValueFieldIds } }
          : undefined,
      select: {
        entityFieldId: true,
        textValue: true,
        integerValue: true,
        decimalValue: true,
        booleanValue: true,
        dateValue: true,
        jsonValue: true,
      },
    },
  } satisfies Prisma.EntityRecordInclude;
}

type ResolvedEntityRecordSort = EntityRecordSort & {
  explicit: boolean;
  field?: FieldWithOptions;
};

const sortableFieldTypes = new Set<EntityFieldType>([
  "TEXT",
  "TEXTAREA",
  "EMAIL",
  "PHONE",
  "URL",
  "INTEGER",
  "DECIMAL",
  "MONEY",
  "DATE",
  "DATETIME",
  "TIME",
  "BOOLEAN",
  "SELECT",
]);

export function resolveEntityRecordSort({
  fields,
  listFields,
  sortKey,
  direction,
}: {
  fields: FieldWithOptions[];
  listFields?: FieldWithOptions[];
  sortKey?: string;
  direction?: string;
}): ResolvedEntityRecordSort {
  const normalizedDirection: EntityRecordSortDirection =
    direction === "asc" || direction === "desc" ? direction : "desc";

  if (sortKey === "displayName" || sortKey === "updatedAt") {
    return {
      key: sortKey,
      direction: normalizedDirection,
      explicit: true,
    };
  }

  if (sortKey?.startsWith("field:")) {
    const fieldId = sortKey.slice("field:".length);
    const visibleSortableFields = getSortableFieldCandidates(fields, listFields);
    const field = visibleSortableFields.find(
      (item) => item.id === fieldId && sortableFieldTypes.has(item.type),
    );

    if (field) {
      return {
        key: `field:${field.id}`,
        direction: normalizedDirection,
        explicit: true,
        field,
      };
    }
  }

  if (!sortKey) {
    const primaryField = getConfiguredPrimaryField(fields);

    if (primaryField) {
      const primarySort = resolveEntityRecordSort({
        fields,
        listFields: [primaryField],
        sortKey: `field:${primaryField.id}`,
        direction: normalizedDirection,
      });

      if (primarySort.explicit) {
        return {
          ...primarySort,
          explicit: false,
        };
      }
    }
  }

  return {
    key: "displayName",
    direction: "desc",
    explicit: false,
  };
}

export function resolvePrimaryDisplaySortKey({
  fields,
  primaryField,
}: {
  fields: FieldWithOptions[];
  primaryField?: FieldWithOptions | null;
}): EntityRecordSortKey {
  if (!primaryField) {
    return "displayName";
  }

  if (!parseFieldConfig(primaryField.config).display.primary) {
    return "displayName";
  }

  const primarySort = resolveEntityRecordSort({
    fields,
    listFields: [primaryField],
    sortKey: `field:${primaryField.id}`,
  });

  return primarySort.explicit ? primarySort.key : "displayName";
}

function getConfiguredPrimaryField(fields: FieldWithOptions[]) {
  return orderEntityFields(fields).find(
    (field) => parseFieldConfig(field.config).display.primary === true,
  );
}

function getSortableFieldCandidates(
  fields: FieldWithOptions[],
  listFields?: FieldWithOptions[],
) {
  const candidates = listFields ? [...listFields] : getRecordListFields(fields);
  const configuredPrimary = getConfiguredPrimaryField(fields);

  if (configuredPrimary && !candidates.some((field) => field.id === configuredPrimary.id)) {
    candidates.push(configuredPrimary);
  }

  return candidates;
}

export async function getEntityRecordIdsForSort({
  entityTypeId,
  fields,
  listFields,
  query,
  sort,
}: {
  entityTypeId: string;
  fields: FieldWithOptions[];
  listFields?: FieldWithOptions[];
  query?: string;
  sort?: {
    key?: string;
    direction?: string;
  };
}) {
  const resolvedSort = resolveEntityRecordSort({
    fields,
    listFields,
    sortKey: sort?.key,
    direction: sort?.direction,
  });

  if (resolvedSort.field) {
    return {
      ids: await getSortedRecordIdsByField({
        entityTypeId,
        fields,
        field: resolvedSort.field,
        query,
        skip: 0,
        direction: resolvedSort.direction,
      }),
      sort: resolvedSort,
    };
  }

  const records = await prisma.entityRecord.findMany({
    where: buildEntityRecordSearchWhere({ entityTypeId, fields, query }),
    select: { id: true },
    orderBy: entityRecordOrderBy(resolvedSort),
  });

  return {
    ids: records.map((record) => record.id),
    sort: resolvedSort,
  };
}

function entityRecordOrderBy(sort: ResolvedEntityRecordSort): Prisma.EntityRecordOrderByWithRelationInput[] {
  if (sort.key === "displayName") {
    return [{ displayName: sort.direction }, { id: "asc" }];
  }

  return [{ updatedAt: sort.direction }, { displayName: "asc" }, { id: "asc" }];
}

async function findRecordsSortedByField({
  entityTypeId,
  fields,
  field,
  include,
  pageSize,
  query,
  skip,
  sort,
}: {
  entityTypeId: string;
  fields: FieldWithOptions[];
  field: FieldWithOptions;
  include: ReturnType<typeof entityRecordListInclude>;
  pageSize: number;
  query?: string;
  skip: number;
  sort: ResolvedEntityRecordSort;
}) {
  const ids = await getSortedRecordIdsByField({
    entityTypeId,
    fields,
    field,
    pageSize,
    query,
    skip,
    direction: sort.direction,
  });

  if (ids.length === 0) {
    return [];
  }

  const records = await prisma.entityRecord.findMany({
    where: {
      id: { in: ids },
      entityTypeId,
    },
    include,
  });
  const order = new Map(ids.map((id, index) => [id, index]));

  return records.sort((first, second) => {
    return (order.get(first.id) ?? 0) - (order.get(second.id) ?? 0);
  });
}

async function getSortedRecordIdsByField({
  entityTypeId,
  fields,
  field,
  pageSize,
  query,
  skip,
  direction,
}: {
  entityTypeId: string;
  fields: FieldWithOptions[];
  field: FieldWithOptions;
  pageSize?: number;
  query?: string;
  skip: number;
  direction: EntityRecordSortDirection;
}) {
  const valueExpression = sortableFieldValueExpression(field);
  const directionSql = direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const limitSql = pageSize === undefined ? Prisma.empty : Prisma.sql`LIMIT ${pageSize}`;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT r."id"
      FROM "EntityRecord" r
      LEFT JOIN "EntityValue" v
        ON v."entityRecordId" = r."id"
        AND v."entityFieldId" = ${field.id}
      WHERE r."entityTypeId" = ${entityTypeId}
      ${entityRecordSearchSql({ entityTypeId, fields, query })}
      ORDER BY
        (${valueExpression} IS NULL) ASC,
        ${valueExpression} ${directionSql},
        r."displayName" ASC,
        r."id" ASC
      OFFSET ${skip}
      ${limitSql}
    `,
  );

  return rows.map((row) => row.id);
}

function sortableFieldValueExpression(field: FieldWithOptions) {
  if (field.type === "INTEGER") return Prisma.sql`v."integerValue"`;
  if (field.type === "DECIMAL" || field.type === "MONEY") return Prisma.sql`v."decimalValue"`;
  if (field.type === "DATE" || field.type === "DATETIME") return Prisma.sql`v."dateValue"`;
  if (field.type === "BOOLEAN") return Prisma.sql`v."booleanValue"`;

  if (field.type === "SELECT" && field.options.length > 0) {
    const cases = field.options.map(
      (option) => Prisma.sql`WHEN v."textValue" = ${option.value} THEN ${option.label}`,
    );

    return Prisma.sql`CASE ${Prisma.join(cases, " ")} ELSE v."textValue" END`;
  }

  return Prisma.sql`v."textValue"`;
}

function entityRecordSearchSql({
  entityTypeId,
  fields,
  query,
}: {
  entityTypeId: string;
  fields: FieldWithOptions[];
  query?: string;
}) {
  const normalizedQuery = query?.trim();

  if (!normalizedQuery) {
    return Prisma.empty;
  }

  const pattern = `%${normalizedQuery}%`;
  const conditions: Prisma.Sql[] = [Prisma.sql`r."displayName" ILIKE ${pattern}`];
  const textFieldIds = fields
    .filter(
      (field) =>
        field.entityTypeId === entityTypeId &&
        field.searchable &&
        searchableTextFieldTypes.has(field.type),
    )
    .map((field) => field.id);
  const selectValueSearches = fields
    .filter(
      (field) =>
        field.entityTypeId === entityTypeId &&
        field.searchable &&
        field.type === "SELECT",
    )
    .map((field) => ({
      fieldId: field.id,
      values: field.options
        .filter((option) => optionMatchesSearch(option, normalizedQuery))
        .map((option) => option.value),
    }))
    .filter((item) => item.values.length > 0);

  if (textFieldIds.length > 0) {
    conditions.push(Prisma.sql`
      EXISTS (
        SELECT 1
        FROM "EntityValue" sv
        WHERE sv."entityRecordId" = r."id"
          AND sv."entityFieldId" IN (${Prisma.join(textFieldIds)})
          AND sv."textValue" ILIKE ${pattern}
      )
    `);
  }

  for (const search of selectValueSearches) {
    conditions.push(Prisma.sql`
      EXISTS (
        SELECT 1
        FROM "EntityValue" sv
        WHERE sv."entityRecordId" = r."id"
          AND sv."entityFieldId" = ${search.fieldId}
          AND sv."textValue" IN (${Prisma.join(search.values)})
      )
    `);
  }

  return Prisma.sql`AND (${Prisma.join(conditions, " OR ")})`;
}

const searchableTextFieldTypes = new Set([
  "TEXT",
  "TEXTAREA",
  "EMAIL",
  "PHONE",
  "URL",
  "TIME",
]);

export function buildEntityRecordSearchWhere({
  entityTypeId,
  fields,
  query,
}: {
  entityTypeId: string;
  fields: FieldWithOptions[];
  query?: string;
}): Prisma.EntityRecordWhereInput {
  const normalizedQuery = query?.trim();
  const baseWhere: Prisma.EntityRecordWhereInput = {
    entityTypeId,
  };

  if (!normalizedQuery) {
    return baseWhere;
  }

  const textFieldIds = fields
    .filter(
      (field) =>
        field.entityTypeId === entityTypeId &&
        field.searchable &&
        searchableTextFieldTypes.has(field.type),
    )
    .map((field) => field.id);
  const selectValueSearches = fields
    .filter(
      (field) =>
        field.entityTypeId === entityTypeId &&
        field.searchable &&
        field.type === "SELECT",
    )
    .map((field) => ({
      fieldId: field.id,
      values: field.options
        .filter((option) => optionMatchesSearch(option, normalizedQuery))
        .map((option) => option.value),
    }))
    .filter((item) => item.values.length > 0);
  const orConditions: Prisma.EntityRecordWhereInput[] = [
    {
      displayName: {
        contains: normalizedQuery,
        mode: "insensitive",
      },
    },
  ];

  if (textFieldIds.length > 0) {
    orConditions.push({
      values: {
        some: {
          entityFieldId: { in: textFieldIds },
          textValue: {
            contains: normalizedQuery,
            mode: "insensitive",
          },
        },
      },
    });
  }

  for (const search of selectValueSearches) {
    orConditions.push({
      values: {
        some: {
          entityFieldId: search.fieldId,
          textValue: { in: search.values },
        },
      },
    });
  }

  return {
    ...baseWhere,
    OR: orConditions,
  };
}

export async function getAuthorizedEntityRecord(
  contractId: string,
  entityTypeId: string,
  recordId: string,
  userId: string,
) {
  const authorized = await getAuthorizedRecordEntityType(
    contractId,
    entityTypeId,
    userId,
  );

  if (!authorized) {
    return null;
  }

  const record = await prisma.entityRecord.findFirst({
    where: {
      id: recordId,
      entityTypeId: authorized.entityType.id,
    },
    include: {
      values: {
        include: {
          entityField: {
            include: {
              options: {
                orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
              },
            },
          },
        },
      },
      outgoingRelations: true,
    },
  });

  if (!record) {
    return null;
  }

  return { ...authorized, record };
}

export async function createEntityRecord(
  contractId: string,
  entityTypeId: string,
  userId: string,
  formData: FormData,
) {
  const authorized = await getAuthorizedRecordEntityType(
    contractId,
    entityTypeId,
    userId,
  );

  if (!authorized) {
    return null;
  }

  const values = await validateEntityValues({
    fields: authorized.entityType.fields,
    formData,
    mode: "create",
  });
  const relations = await validateRelationValues({
    contractId: authorized.contract.id,
    entityTypeId: authorized.entityType.id,
    fields: authorized.entityType.fields,
    formData,
  });
  const displayName = getRecordDisplayName(authorized.entityType.fields, values);
  const valueChanges = buildValueChanges({
    fields: authorized.entityType.fields,
    oldValues: [],
    newValues: values,
  });
  const relationChanges = await buildRelationChanges({
    contractId: authorized.contract.id,
    fields: authorized.entityType.fields.filter((field) => field.type === "RELATION"),
    oldRelations: [],
    newRelations: relations,
  });

  return prisma.$transaction(async (tx) => {
    const record = await tx.entityRecord.create({
      data: {
        entityTypeId: authorized.entityType.id,
        displayName,
      },
    });

    if (values.length > 0) {
      await tx.entityValue.createMany({
        data: values.map((value) => ({
          entityRecordId: record.id,
          entityFieldId: value.fieldId,
          textValue: value.textValue ?? null,
          integerValue: value.integerValue ?? null,
          decimalValue: value.decimalValue ?? null,
          booleanValue: value.booleanValue ?? null,
          dateValue: value.dateValue ?? null,
          jsonValue: value.jsonValue ?? Prisma.JsonNull,
        })),
      });
    }

    await syncEntityRelations(tx, record.id, relations);
    await createAuditEvent(tx, {
      contractId: authorized.contract.id,
      entityTypeId: authorized.entityType.id,
      entityRecordId: record.id,
      actorUserId: userId,
      action: "RECORD_CREATED",
      summary: `Creó ${authorized.entityType.name} ${record.displayName}`,
      metadata: {
        displayName: record.displayName,
        entityTypeName: authorized.entityType.name,
      },
      changes: [...valueChanges, ...relationChanges.added],
    });

    return record;
  });
}

export async function updateEntityRecord(
  contractId: string,
  entityTypeId: string,
  recordId: string,
  userId: string,
  formData: FormData,
) {
  const authorized = await getAuthorizedEntityRecord(
    contractId,
    entityTypeId,
    recordId,
    userId,
  );

  if (!authorized) {
    return null;
  }

  const values = await validateEntityValues({
    fields: authorized.entityType.fields,
    formData,
    mode: "edit",
    recordId: authorized.record.id,
  });
  const relations = await validateRelationValues({
    contractId: authorized.contract.id,
    entityTypeId: authorized.entityType.id,
    fields: authorized.entityType.fields,
    formData,
    sourceRecordId: authorized.record.id,
  });
  const displayName = getRecordDisplayName(authorized.entityType.fields, values);
  const valueChanges = buildValueChanges({
    fields: authorized.entityType.fields,
    oldValues: authorized.record.values,
    newValues: values,
  });
  const relationChanges = await buildRelationChanges({
    contractId: authorized.contract.id,
    fields: authorized.entityType.fields.filter((field) => field.type === "RELATION"),
    oldRelations: authorized.record.outgoingRelations,
    newRelations: relations,
  });
  const hasChanges =
    valueChanges.length > 0 ||
    relationChanges.added.length > 0 ||
    relationChanges.removed.length > 0;

  if (!hasChanges) {
    return authorized.record;
  }

  return prisma.$transaction(async (tx) => {
    await tx.entityValue.deleteMany({
      where: {
        entityRecordId: authorized.record.id,
        entityFieldId: { in: authorized.entityType.fields.map((field) => field.id) },
      },
    });

    if (values.length > 0) {
      await tx.entityValue.createMany({
        data: values.map((value) => ({
          entityRecordId: authorized.record.id,
          entityFieldId: value.fieldId,
          textValue: value.textValue ?? null,
          integerValue: value.integerValue ?? null,
          decimalValue: value.decimalValue ?? null,
          booleanValue: value.booleanValue ?? null,
          dateValue: value.dateValue ?? null,
          jsonValue: value.jsonValue ?? Prisma.JsonNull,
        })),
      });
    }

    await syncEntityRelations(tx, authorized.record.id, relations);

    const updatedRecord = await tx.entityRecord.update({
      where: { id: authorized.record.id },
      data: {
        displayName,
      },
    });

    if (valueChanges.length > 0) {
      await createAuditEvent(tx, {
        contractId: authorized.contract.id,
        entityTypeId: authorized.entityType.id,
        entityRecordId: authorized.record.id,
        actorUserId: userId,
        action: "RECORD_UPDATED",
        summary: `Actualizó ${authorized.entityType.name} ${updatedRecord.displayName}`,
        metadata: {
          displayName: updatedRecord.displayName,
          entityTypeName: authorized.entityType.name,
        },
        changes: valueChanges,
      });
    }

    if (relationChanges.added.length > 0) {
      await createAuditEvent(tx, {
        contractId: authorized.contract.id,
        entityTypeId: authorized.entityType.id,
        entityRecordId: authorized.record.id,
        actorUserId: userId,
        action: "RELATION_ADDED",
        summary: `Agregó relaciones en ${authorized.entityType.name} ${updatedRecord.displayName}`,
        metadata: {
          displayName: updatedRecord.displayName,
          entityTypeName: authorized.entityType.name,
        },
        changes: relationChanges.added,
      });
    }

    if (relationChanges.removed.length > 0) {
      await createAuditEvent(tx, {
        contractId: authorized.contract.id,
        entityTypeId: authorized.entityType.id,
        entityRecordId: authorized.record.id,
        actorUserId: userId,
        action: "RELATION_REMOVED",
        summary: `Quitó relaciones en ${authorized.entityType.name} ${updatedRecord.displayName}`,
        metadata: {
          displayName: updatedRecord.displayName,
          entityTypeName: authorized.entityType.name,
        },
        changes: relationChanges.removed,
      });
    }

    return updatedRecord;
  });
}

export async function deleteEntityRecordsPermanently(
  contractId: string,
  entityTypeId: string,
  recordIds: string[],
  userId: string,
  confirmationText: string,
) {
  const ids = uniqueRecordIds(recordIds);
  const expectedConfirmation = deleteRecordsConfirmationText(ids.length);

  if (ids.length === 0) {
    throw userError("Selecciona al menos un registro.");
  }

  if (confirmationText.trim() !== expectedConfirmation) {
    throw userError("La confirmación no coincide.");
  }

  const authorized = await getAuthorizedRecordEntityType(contractId, entityTypeId, userId);

  if (!authorized) {
    return null;
  }

  return prisma.$transaction(async (tx) => {
    const records = await tx.entityRecord.findMany({
      where: {
        id: { in: ids },
        entityTypeId: authorized.entityType.id,
        entityType: {
          contractId: authorized.contract.id,
        },
      },
      select: { id: true },
    });

    assertAllRecordsAuthorized(ids, records.map((record) => record.id));

    await tx.auditChange.deleteMany({
      where: {
        auditEvent: {
          entityRecordId: { in: ids },
          contractId: authorized.contract.id,
        },
      },
    });
    await tx.auditEvent.deleteMany({
      where: {
        entityRecordId: { in: ids },
        contractId: authorized.contract.id,
      },
    });
    await tx.entityRelation.deleteMany({
      where: {
        OR: [
          { sourceRecordId: { in: ids } },
          { targetRecordId: { in: ids } },
        ],
      },
    });
    await tx.entityValue.deleteMany({
      where: { entityRecordId: { in: ids } },
    });
    const deleted = await tx.entityRecord.deleteMany({
      where: {
        id: { in: ids },
        entityTypeId: authorized.entityType.id,
      },
    });

    if (deleted.count !== ids.length) {
      throw userError("No se pudieron eliminar todos los registros seleccionados.");
    }

    return { count: deleted.count };
  });
}

export function deleteRecordsConfirmationText(count: number) {
  return `ELIMINAR ${count} REGISTROS`;
}

function uniqueRecordIds(recordIds: string[]) {
  return Array.from(
    new Set(recordIds.map((recordId) => recordId.trim()).filter(Boolean)),
  );
}

function assertAllRecordsAuthorized(requestedIds: string[], foundIds: string[]) {
  if (foundIds.length !== requestedIds.length) {
    throw userError("Uno o más registros seleccionados no pertenecen a este contexto.");
  }
}

export async function validateEntityValues({
  fields,
  formData,
  mode = "edit",
  recordId,
}: {
  fields: FieldWithOptions[];
  formData: FormData;
  mode?: "create" | "edit";
  recordId?: string;
}) {
  const values = validateRecordValues({ fields, formData, mode });

  for (const value of values) {
    const field = fields.find((item) => item.id === value.fieldId);
    if (!field) {
      continue;
    }
    if (field.isUnique && !isEmptySerializedValue(value)) {
      await validateUniqueValue(field.entityTypeId, field, value, recordId);
    }
  }

  return values;
}

export async function getRelationOptions(
  contractId: string,
  entityTypeId: string,
  userId: string,
) {
  const authorized = await getAuthorizedRecordEntityType(
    contractId,
    entityTypeId,
    userId,
  );

  if (!authorized) {
    return null;
  }

  const relationFields = authorized.entityType.fields.filter(
    (field) => field.type === "RELATION",
  );
  const optionsByFieldId: Record<
    string,
    Array<{
      id: string;
      displayName: string;
      entityTypeName: string;
    }>
  > = {};

  for (const field of relationFields) {
    const config = getRelationConfig(field.config);

    if (!config.targetEntityTypeId) {
      optionsByFieldId[field.id] = [];
      continue;
    }

    const options = await prisma.entityRecord.findMany({
      where: {
        entityType: {
          id: config.targetEntityTypeId,
          contractId: authorized.contract.id,
        },
      },
      include: {
        entityType: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { displayName: "asc" },
    });

    optionsByFieldId[field.id] = options.map((record) => ({
      id: record.id,
      displayName: record.displayName,
      entityTypeName: record.entityType.name,
    }));
  }

  return optionsByFieldId;
}

export async function validateRelationValues({
  contractId,
  entityTypeId,
  fields,
  formData,
  sourceRecordId,
}: {
  contractId: string;
  entityTypeId: string;
  fields: FieldWithOptions[];
  formData: FormData;
  sourceRecordId?: string;
}) {
  const relationInputs = validateRelationInputs({ fields, formData });

  for (const field of fields) {
    if (field.type !== "RELATION") {
      continue;
    }

    if (field.entityTypeId !== entityTypeId) {
      throw userError("El campo de relación no pertenece al tipo de entidad.");
    }

    const config = getRelationConfig(field.config);

    if (!config.targetEntityTypeId) {
      throw userError(`${field.name} no tiene entidad objetivo configurada.`);
    }

    const targetRecordIds =
      relationInputs.find((relation) => relation.fieldId === field.id)?.targetRecordIds ??
      [];

    if (config.relationKind === "ONE" && targetRecordIds.length > 1) {
      throw userError(`${field.name} admite solo una relación.`);
    }

    if (sourceRecordId && targetRecordIds.includes(sourceRecordId)) {
      throw userError(`${field.name} no puede relacionar un registro consigo mismo.`);
    }

    if (targetRecordIds.length > 0) {
      const targetCount = await prisma.entityRecord.count({
        where: {
          id: { in: targetRecordIds },
          entityType: {
            id: config.targetEntityTypeId,
            contractId,
          },
        },
      });

      if (targetCount !== targetRecordIds.length) {
        throw userError(`${field.name} contiene registros relacionados no válidos.`);
      }
    }

  }

  return relationInputs;
}

export async function syncEntityRelations(
  tx: Prisma.TransactionClient,
  sourceRecordId: string,
  relations: RelationInput[],
) {
  for (const relation of relations) {
    const targetIds = new Set(relation.targetRecordIds);

    await tx.entityRelation.deleteMany({
      where: {
        sourceRecordId,
        sourceFieldId: relation.fieldId,
        targetRecordId: { notIn: relation.targetRecordIds },
      },
    });

    const existing = await tx.entityRelation.findMany({
      where: {
        sourceRecordId,
        sourceFieldId: relation.fieldId,
      },
      select: {
        targetRecordId: true,
      },
    });
    const existingIds = new Set(existing.map((item) => item.targetRecordId));
    const newTargetIds = Array.from(targetIds).filter(
      (targetRecordId) => !existingIds.has(targetRecordId),
    );

    if (newTargetIds.length > 0) {
      await tx.entityRelation.createMany({
        data: newTargetIds.map((targetRecordId) => ({
          sourceRecordId,
          sourceFieldId: relation.fieldId,
          targetRecordId,
        })),
        skipDuplicates: true,
      });
    }
  }
}

export async function getRecordRelations(
  contractId: string,
  entityTypeId: string,
  recordId: string,
  userId: string,
) {
  const authorized = await getAuthorizedEntityRecord(
    contractId,
    entityTypeId,
    recordId,
    userId,
  );

  if (!authorized) {
    return null;
  }

  const relations = await prisma.entityRelation.findMany({
    where: {
      sourceRecordId: authorized.record.id,
      sourceField: {
        entityTypeId: authorized.entityType.id,
        type: "RELATION",
      },
      targetRecord: {
        entityType: {
          contractId: authorized.contract.id,
        },
      },
    },
    include: {
      sourceField: true,
      targetRecord: {
        include: {
          entityType: true,
        },
      },
    },
    orderBy: [{ sourceField: { sortOrder: "asc" } }, { targetRecord: { displayName: "asc" } }],
  });

  return relations;
}

export async function getIncomingRecordRelations(
  contractId: string,
  entityTypeId: string,
  recordId: string,
  userId: string,
) {
  const authorized = await getAuthorizedEntityRecord(
    contractId,
    entityTypeId,
    recordId,
    userId,
  );

  if (!authorized) {
    return null;
  }

  const relations = await prisma.entityRelation.findMany({
    where: {
      targetRecordId: authorized.record.id,
      sourceRecord: {
        entityType: {
          contractId: authorized.contract.id,
        },
      },
    },
    include: {
      sourceField: true,
      sourceRecord: {
        include: {
          entityType: true,
        },
      },
    },
    orderBy: [{ sourceRecord: { displayName: "asc" } }, { sourceField: { name: "asc" } }],
  });

  return relations;
}

export function serializeEntityValue(
  field: FieldWithOptions,
  formData: FormData,
): ValueInput {
  return normalizeRawFieldValue(field, formData.getAll(`field_${field.id}`));
}

export function deserializeEntityValue(value: {
  textValue: string | null;
  integerValue: number | null;
  decimalValue: Prisma.Decimal | null;
  booleanValue: boolean | null;
  dateValue: Date | null;
  jsonValue: Prisma.JsonValue | null;
  entityField?: {
    type: string;
    config?: Prisma.JsonValue | null;
    options?: Array<{ label: string; value: string }>;
  };
}) {
  if (value.entityField?.type === "SELECT" && value.textValue) {
    return (
      value.entityField.options?.find((option) => option.value === value.textValue)?.label ??
      value.textValue
    );
  }

  if (value.entityField?.type === "MULTISELECT" && Array.isArray(value.jsonValue)) {
    return value.jsonValue
      .map((item) => {
        const optionValue = String(item);

        return (
          value.entityField?.options?.find((option) => option.value === optionValue)?.label ??
          optionValue
        );
      })
      .join(", ");
  }

  if (value.textValue) {
    return value.textValue;
  }

  if (value.integerValue !== null) {
    return String(value.integerValue);
  }

  if (value.decimalValue !== null) {
    if (value.entityField?.type === "MONEY") {
      return formatMoneyValue(
        value.decimalValue,
        getMoneyConfig(value.entityField.config).currency,
      );
    }

    return value.decimalValue.toString();
  }

  if (value.booleanValue !== null) {
    return value.booleanValue ? "Sí" : "No";
  }

  if (value.dateValue) {
    if (value.entityField?.type === "DATE") {
      return formatDateOnly(value.dateValue);
    }

    return value.dateValue.toLocaleDateString("es-CL");
  }

  if (Array.isArray(value.jsonValue)) {
    return value.jsonValue.map(String).join(", ");
  }

  if (value.jsonValue && typeof value.jsonValue === "object") {
    return JSON.stringify(value.jsonValue);
  }

  return "";
}

export function getExistingFormValue(
  fieldId: string,
  values: Array<{
    entityFieldId: string;
    textValue: string | null;
    integerValue: number | null;
    decimalValue: Prisma.Decimal | null;
    booleanValue: boolean | null;
    dateValue: Date | null;
    jsonValue: Prisma.JsonValue | null;
  }>,
) {
  return values.find((value) => value.entityFieldId === fieldId);
}

function clampPageSize(pageSize: number) {
  if (pageSize === 25 || pageSize === 50 || pageSize === 100) {
    return pageSize;
  }

  return 50;
}

function optionMatchesSearch(
  option: { label: string; value: string },
  query: string,
) {
  const normalizedQuery = query.toLowerCase();

  return (
    option.label.toLowerCase().includes(normalizedQuery) ||
    option.value.toLowerCase().includes(normalizedQuery)
  );
}

async function validateUniqueValue(
  entityTypeId: string,
  field: FieldWithOptions,
  value: ValueInput,
  recordId?: string,
) {
  const existing = await prisma.entityValue.findFirst({
    where: {
      entityFieldId: field.id,
      entityRecord: {
        entityTypeId,
        ...(recordId ? { id: { not: recordId } } : {}),
      },
      ...uniqueValueWhere(value),
    },
    select: { id: true },
  });

  if (existing) {
    throw userError(`${field.name} debe ser único dentro de este tipo de entidad.`);
  }
}

function uniqueValueWhere(value: ValueInput) {
  if (value.textValue !== undefined) {
    return { textValue: value.textValue };
  }

  if (value.integerValue !== undefined) {
    return { integerValue: value.integerValue };
  }

  if (value.decimalValue !== undefined) {
    return { decimalValue: value.decimalValue };
  }

  if (value.booleanValue !== undefined) {
    return { booleanValue: value.booleanValue };
  }

  if (value.dateValue !== undefined) {
    return { dateValue: value.dateValue };
  }

  return { jsonValue: { equals: value.jsonValue ?? Prisma.JsonNull } };
}

function userError(message: string) {
  const error = new Error(message);
  error.name = "UserFacingError";

  return error;
}

export {
  FieldValidationError,
  getPrimaryDisplayField,
  getRecordDisplayName,
  getRecordListFields,
  getRelationConfig,
};
