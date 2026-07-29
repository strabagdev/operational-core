import { type AuditAction, Prisma } from "@prisma/client";

import { getAuthorizedContract } from "@/lib/contracts";
import { prisma } from "@/lib/prisma";

type AuditJson = Prisma.InputJsonValue | typeof Prisma.JsonNull;

type AuditChangeInput = {
  entityFieldId?: string | null;
  fieldName: string;
  oldValue: AuditJson;
  newValue: AuditJson;
};

type AuditableValue = {
  entityFieldId?: string;
  fieldId?: string;
  textValue?: string | null;
  integerValue?: number | null;
  decimalValue?: Prisma.Decimal | null;
  booleanValue?: boolean | null;
  dateValue?: Date | null;
  jsonValue?: Prisma.JsonValue | Prisma.InputJsonValue | typeof Prisma.JsonNull | null;
};

type AuditableField = {
  id: string;
  name: string;
};

type AuditableRelation = {
  sourceFieldId: string;
  targetRecordId: string;
};

export const auditActionLabels: Record<AuditAction, string> = {
  RECORD_CREATED: "Registro creado",
  RECORD_UPDATED: "Registro actualizado",
  RECORD_STATUS_CHANGED: "Estado actualizado",
  RECORD_ARCHIVED: "Registro archivado",
  VALUE_CHANGED: "Valor actualizado",
  RELATION_ADDED: "Relación agregada",
  RELATION_REMOVED: "Relación removida",
};

export async function createAuditEvent(
  tx: Prisma.TransactionClient,
  input: {
    contractId: string;
    entityTypeId?: string | null;
    entityRecordId?: string | null;
    actorUserId?: string | null;
    action: AuditAction;
    summary: string;
    metadata?: Prisma.InputJsonValue;
    changes?: AuditChangeInput[];
  },
) {
  return tx.auditEvent.create({
    data: {
      contractId: input.contractId,
      entityTypeId: input.entityTypeId ?? null,
      entityRecordId: input.entityRecordId ?? null,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      summary: input.summary,
      metadata: input.metadata ?? Prisma.JsonNull,
      changes: input.changes?.length
        ? {
            create: input.changes.map((change) => ({
              entityFieldId: change.entityFieldId ?? null,
              fieldName: change.fieldName,
              oldValue: change.oldValue,
              newValue: change.newValue,
            })),
          }
        : undefined,
    },
  });
}

export function buildValueChanges({
  fields,
  oldValues,
  newValues,
}: {
  fields: AuditableField[];
  oldValues: AuditableValue[];
  newValues: AuditableValue[];
}) {
  const changes: AuditChangeInput[] = [];

  for (const field of fields) {
    const oldValue = oldValues.find((value) => getValueFieldId(value) === field.id);
    const newValue = newValues.find((value) => getValueFieldId(value) === field.id);
    const oldAuditValue = serializeAuditValue(oldValue);
    const newAuditValue = serializeAuditValue(newValue);

    if (!sameAuditValue(oldAuditValue, newAuditValue)) {
      changes.push({
        entityFieldId: field.id,
        fieldName: field.name,
        oldValue: oldAuditValue,
        newValue: newAuditValue,
      });
    }
  }

  return changes;
}

function getValueFieldId(value: AuditableValue) {
  return value.entityFieldId ?? value.fieldId;
}

export async function buildRelationChanges({
  contractId,
  fields,
  oldRelations,
  newRelations,
}: {
  contractId: string;
  fields: AuditableField[];
  oldRelations: AuditableRelation[];
  newRelations: Array<{ fieldId: string; targetRecordIds: string[] }>;
}) {
  const changes = {
    added: [] as AuditChangeInput[],
    removed: [] as AuditChangeInput[],
  };
  const targetRecordIds = new Set<string>();

  for (const relation of oldRelations) {
    targetRecordIds.add(relation.targetRecordId);
  }

  for (const relation of newRelations) {
    for (const targetRecordId of relation.targetRecordIds) {
      targetRecordIds.add(targetRecordId);
    }
  }

  const targetRecords = await prisma.entityRecord.findMany({
    where: {
      id: { in: Array.from(targetRecordIds) },
      entityType: {
        contractId,
      },
    },
    include: { entityType: true },
  });
  const targetById = new Map(targetRecords.map((record) => [record.id, record]));

  for (const field of fields) {
    const oldTargetIds = new Set(
      oldRelations
        .filter((relation) => relation.sourceFieldId === field.id)
        .map((relation) => relation.targetRecordId),
    );
    const newTargetIds = new Set(
      newRelations
        .find((relation) => relation.fieldId === field.id)
        ?.targetRecordIds ?? [],
    );

    for (const targetRecordId of newTargetIds) {
      if (!oldTargetIds.has(targetRecordId)) {
        changes.added.push({
          entityFieldId: field.id,
          fieldName: field.name,
          oldValue: Prisma.JsonNull,
          newValue: serializeRelationTarget(targetById.get(targetRecordId)),
        });
      }
    }

    for (const targetRecordId of oldTargetIds) {
      if (!newTargetIds.has(targetRecordId)) {
        changes.removed.push({
          entityFieldId: field.id,
          fieldName: field.name,
          oldValue: serializeRelationTarget(targetById.get(targetRecordId)),
          newValue: Prisma.JsonNull,
        });
      }
    }
  }

  return changes;
}

export function serializeAuditValue(value?: AuditableValue) {
  if (!value) {
    return Prisma.JsonNull;
  }

  if (value.textValue !== undefined && value.textValue !== null) {
    return value.textValue;
  }

  if (value.integerValue !== undefined && value.integerValue !== null) {
    return value.integerValue;
  }

  if (value.decimalValue !== undefined && value.decimalValue !== null) {
    return value.decimalValue.toString();
  }

  if (value.booleanValue !== undefined && value.booleanValue !== null) {
    return value.booleanValue;
  }

  if (value.dateValue !== undefined && value.dateValue !== null) {
    return value.dateValue.toISOString();
  }

  if (value.jsonValue !== undefined && value.jsonValue !== null) {
    return value.jsonValue as Prisma.InputJsonValue;
  }

  return Prisma.JsonNull;
}

export function formatAuditValue(value: Prisma.JsonValue | null) {
  if (value === null) {
    return "Sin valor";
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;

    if (typeof record.displayName === "string") {
      return record.displayName;
    }

    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "boolean") {
    return value ? "Sí" : "No";
  }

  return String(value);
}

export async function getRecordAuditHistory(
  contractId: string,
  entityTypeId: string,
  recordId: string,
  userId: string,
  page = 1,
) {
  const contract = await getAuthorizedContract(contractId, userId);

  if (!contract) {
    return null;
  }

  const record = await prisma.entityRecord.findFirst({
    where: {
      id: recordId,
      entityTypeId,
      entityType: {
        contractId: contract.id,
      },
    },
    select: { id: true },
  });

  if (!record) {
    return null;
  }

  const pageSize = 25;
  const currentPage = Math.max(page, 1);
  const events = await prisma.auditEvent.findMany({
    where: {
      contractId: contract.id,
      entityRecordId: record.id,
    },
    include: {
      actorUser: {
        select: {
          name: true,
          email: true,
        },
      },
      changes: {
        orderBy: { id: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * pageSize,
    take: pageSize + 1,
  });

  return {
    events: events.slice(0, pageSize),
    hasNextPage: events.length > pageSize,
    page: currentPage,
  };
}

export async function getContractActivity(
  contractId: string,
  userId: string,
  page = 1,
) {
  const contract = await getAuthorizedContract(contractId, userId);

  if (!contract) {
    return null;
  }

  const pageSize = 25;
  const currentPage = Math.max(page, 1);
  const events = await prisma.auditEvent.findMany({
    where: { contractId: contract.id },
    include: {
      actorUser: {
        select: {
          name: true,
          email: true,
        },
      },
      entityType: {
        select: {
          name: true,
        },
      },
      entityRecord: {
        select: {
          id: true,
          entityTypeId: true,
          displayName: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * pageSize,
    take: pageSize + 1,
  });

  return {
    contract,
    events: events.slice(0, pageSize),
    hasNextPage: events.length > pageSize,
    page: currentPage,
  };
}

function serializeRelationTarget(
  record?: {
    id: string;
    displayName: string;
    entityTypeId: string;
    entityType: { name: string };
  },
) {
  if (!record) {
    return Prisma.JsonNull;
  }

  return {
    id: record.id,
    displayName: record.displayName,
    entityTypeId: record.entityTypeId,
    entityTypeName: record.entityType.name,
  };
}

function sameAuditValue(oldValue: AuditJson, newValue: AuditJson) {
  return JSON.stringify(oldValue) === JSON.stringify(newValue);
}
