import { Prisma, type EntityField, type EntityRecordStatus } from "@prisma/client";

import {
  buildRelationChanges,
  buildValueChanges,
  createAuditEvent,
} from "@/lib/audit";
import { getAuthorizedContract } from "@/lib/contracts";
import {
  FieldValidationError,
  getRelationConfig,
  getPrimaryDisplayField,
  getRecordDisplayName,
  getRecordListFields,
  isEmptySerializedValue,
  normalizeRawFieldValue,
  validateRecordValues,
  validateRelationInputs,
  type RelationInput,
  type SerializedFieldValue,
} from "@/lib/field-validation";
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

export const recordStatusLabels: Record<EntityRecordStatus, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  ARCHIVED: "Archivado",
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
        where: {
          status: "ACTIVE",
        },
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
            where: { isActive: true },
            orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
          },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
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
  userId,
  query,
  status,
}: {
  contractId: string;
  entityTypeId: string;
  userId: string;
  query?: string;
  status?: EntityRecordStatus | "ALL";
}) {
  const authorized = await getAuthorizedRecordEntityType(
    contractId,
    entityTypeId,
    userId,
  );

  if (!authorized) {
    return null;
  }

  const records = await prisma.entityRecord.findMany({
    where: {
      entityTypeId: authorized.entityType.id,
      ...(status && status !== "ALL" ? { status } : {}),
    },
    include: {
      values: {
        include: {
          entityField: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const searchableFieldIds = new Set(
    authorized.entityType.fields
      .filter((field) => field.searchable)
      .map((field) => field.id),
  );
  const normalizedQuery = query?.trim().toLowerCase();
  const filteredRecords = normalizedQuery
    ? records.filter((record) => {
        if (record.displayName.toLowerCase().includes(normalizedQuery)) {
          return true;
        }

        return record.values.some((value) => {
          if (!searchableFieldIds.has(value.entityFieldId)) {
            return false;
          }

          return deserializeEntityValue(value)
            .toLowerCase()
            .includes(normalizedQuery);
        });
      })
    : records;

  return {
    ...authorized,
    records: filteredRecords,
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
          entityField: true,
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
        status: "ACTIVE",
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
  const status = parseRecordStatus(formData.get("status"));
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
  const statusChanged = authorized.record.status !== status;
  const hasChanges =
    valueChanges.length > 0 ||
    relationChanges.added.length > 0 ||
    relationChanges.removed.length > 0 ||
    statusChanged;

  if (!hasChanges) {
    return authorized.record;
  }

  return prisma.$transaction(async (tx) => {
    await tx.entityValue.deleteMany({
      where: { entityRecordId: authorized.record.id },
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
        status,
        archivedAt: status === "ARCHIVED" ? (authorized.record.archivedAt ?? new Date()) : null,
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

    if (statusChanged) {
      await createAuditEvent(tx, {
        contractId: authorized.contract.id,
        entityTypeId: authorized.entityType.id,
        entityRecordId: authorized.record.id,
        actorUserId: userId,
        action: "RECORD_STATUS_CHANGED",
        summary: `Cambió el estado de ${authorized.entityType.name} ${updatedRecord.displayName}`,
        metadata: {
          displayName: updatedRecord.displayName,
          entityTypeName: authorized.entityType.name,
        },
        changes: [
          {
            fieldName: "Estado del registro",
            oldValue: authorized.record.status,
            newValue: status,
          },
        ],
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

export async function archiveEntityRecord(
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

  if (authorized.record.status === "ARCHIVED") {
    return authorized.record;
  }

  return prisma.$transaction(async (tx) => {
    const record = await tx.entityRecord.update({
      where: { id: authorized.record.id },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
      },
    });

    await createAuditEvent(tx, {
      contractId: authorized.contract.id,
      entityTypeId: authorized.entityType.id,
      entityRecordId: authorized.record.id,
      actorUserId: userId,
      action: "RECORD_ARCHIVED",
      summary: `Archivó ${authorized.entityType.name} ${authorized.record.displayName}`,
      metadata: {
        displayName: authorized.record.displayName,
        entityTypeName: authorized.entityType.name,
      },
      changes: [
        {
          fieldName: "Estado del registro",
          oldValue: authorized.record.status,
          newValue: "ARCHIVED",
        },
      ],
    });

    return record;
  });
}

export async function restoreEntityRecord(
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

  if (authorized.record.status === "ACTIVE") {
    return authorized.record;
  }

  return prisma.$transaction(async (tx) => {
    const record = await tx.entityRecord.update({
      where: { id: authorized.record.id },
      data: {
        status: "ACTIVE",
        archivedAt: null,
      },
    });

    await createAuditEvent(tx, {
      contractId: authorized.contract.id,
      entityTypeId: authorized.entityType.id,
      entityRecordId: authorized.record.id,
      actorUserId: userId,
      action: "RECORD_STATUS_CHANGED",
      summary: `Restauró ${authorized.entityType.name} ${authorized.record.displayName}`,
      metadata: {
        displayName: authorized.record.displayName,
        entityTypeName: authorized.entityType.name,
      },
      changes: [
        {
          fieldName: "Estado del registro",
          oldValue: authorized.record.status,
          newValue: "ACTIVE",
        },
      ],
    });

    return record;
  });
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
      status: EntityRecordStatus;
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
        status: { not: "ARCHIVED" },
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
      status: record.status,
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
          status: { not: "ARCHIVED" },
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
  entityField?: { type: string };
}) {
  if (value.textValue) {
    return value.textValue;
  }

  if (value.integerValue !== null) {
    return String(value.integerValue);
  }

  if (value.decimalValue !== null) {
    return value.decimalValue.toString();
  }

  if (value.booleanValue !== null) {
    return value.booleanValue ? "Sí" : "No";
  }

  if (value.dateValue) {
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

function parseRecordStatus(value: FormDataEntryValue | null): EntityRecordStatus {
  if (value === "INACTIVE" || value === "ARCHIVED") {
    return value;
  }

  return "ACTIVE";
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
        status: { not: "ARCHIVED" },
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
