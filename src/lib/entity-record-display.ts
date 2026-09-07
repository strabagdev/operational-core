import type { Prisma } from "@prisma/client";

import {
  getPrimaryDisplayField,
  getRecordDisplayNameWithRelations,
  getRelationConfig,
  type DisplayField,
  type RelationInput,
  type SerializedFieldValue,
} from "./field-validation";
import { prisma } from "./prisma";

type EntityRecordDisplayClient = typeof prisma | Prisma.TransactionClient;

export async function buildEntityRecordDisplayName({
  client = prisma,
  contractId,
  fields,
  relations,
  values,
}: {
  client?: EntityRecordDisplayClient;
  contractId: string;
  fields: DisplayField[];
  relations: RelationInput[];
  values: SerializedFieldValue[];
}) {
  const resolvedRelations = await resolvePrimaryDisplayRelations({
    client,
    contractId,
    fields,
    relations,
  });

  return getRecordDisplayNameWithRelations({
    fields,
    relations: resolvedRelations,
    values,
  });
}

async function resolvePrimaryDisplayRelations({
  client,
  contractId,
  fields,
  relations,
}: {
  client: EntityRecordDisplayClient;
  contractId: string;
  fields: DisplayField[];
  relations: RelationInput[];
}) {
  const primaryField = getPrimaryDisplayField(fields);

  if (!primaryField || primaryField.type !== "RELATION") {
    return [];
  }

  const config = getRelationConfig(primaryField.config);

  if (config.relationKind !== "ONE" || !config.targetEntityTypeId) {
    return [];
  }

  const targetRecordId = relations.find((relation) => relation.fieldId === primaryField.id)
    ?.targetRecordIds[0];

  if (!targetRecordId) {
    return [];
  }

  const targetRecord = await client.entityRecord.findFirst({
    where: {
      id: targetRecordId,
      entityType: {
        id: config.targetEntityTypeId,
        contractId,
      },
    },
    select: {
      displayName: true,
      id: true,
    },
  });

  return targetRecord
    ? [
        {
          displayName: targetRecord.displayName,
          fieldId: primaryField.id,
          targetRecordId: targetRecord.id,
        },
      ]
    : [];
}
