import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

import {
  apiEntityNotFoundResponse,
  apiRecordNotFoundResponse,
  getApiEntityRecord,
  type ApiRecordEntity,
} from "@/lib/api-entities";
import { badRequest, conflict, internalError } from "@/lib/api-response";
import {
  buildRelationChanges,
  buildValueChanges,
  createAuditEvent,
} from "@/lib/audit";
import {
  getRecordDisplayName,
  isEmptySerializedValue,
  type RelationInput,
  type SerializedFieldValue,
} from "@/lib/field-validation";
import { prisma } from "@/lib/prisma";
import {
  syncEntityRelations,
  validateEntityValues,
  validateRelationValues,
  FieldValidationError,
} from "@/lib/entity-records";

export type ApiRecordWriteBody = {
  clientRequestId?: string;
  displayName?: string | null;
  values?: Record<string, unknown>;
};

export type ApiRecordWriteError = {
  code: string;
  message: string;
  response: Response;
};

type ApiWriteField = ApiRecordEntity["fields"][number];

export function stableRecordRequestHash(input: unknown) {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

export async function createApiEntityRecord({
  appId,
  body,
  contractId,
  entity,
  userId,
}: {
  appId: string;
  body: unknown;
  contractId: string;
  entity: ApiRecordEntity;
  userId: string;
}) {
  const parsed = parseCreateBody(body);

  if (!parsed.ok) {
    return parsed;
  }

  const requestHash = stableRecordRequestHash({
    displayName: parsed.body.displayName ?? null,
    values: parsed.body.values,
  });
  const operation = `record:create:${contractId}:${entity.id}`;

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.apiIdempotencyKey.create({
        data: {
          clientRequestId: parsed.body.clientRequestId,
          contractId,
          entityTypeId: entity.id,
          externalAppId: appId,
          operation,
          requestHash,
        },
      });

      const mutation = await buildCreateMutation({
        contractId,
        entity,
        rawValues: parsed.body.values,
      });
      const record = await createRecordInTransaction({
        appId,
        displayNameOverride: parsed.body.displayName,
        entity,
        mutation,
        tx,
        userId,
      });

      await tx.apiIdempotencyKey.update({
        data: { entityRecordId: record.id },
        where: {
          externalAppId_operation_clientRequestId: {
            clientRequestId: parsed.body.clientRequestId,
            externalAppId: appId,
            operation,
          },
        },
      });

      return record;
    });

    return { ok: true as const, replay: false as const, recordId: result.id };
  } catch (error) {
    if (isUniqueIdempotencyConflict(error)) {
      const replay = await resolveIdempotentReplay({
        appId,
        clientRequestId: parsed.body.clientRequestId,
        operation,
        requestHash,
      });

      return replay;
    }

    return mapApiWriteException(error);
  }
}

export async function patchApiEntityRecord({
  appId,
  body,
  contractId,
  entity,
  recordId,
  userId,
}: {
  appId: string;
  body: unknown;
  contractId: string;
  entity: ApiRecordEntity;
  recordId: string;
  userId: string;
}) {
  const parsed = parsePatchBody(body);

  if (!parsed.ok) {
    return parsed;
  }

  const existing = await getApiEntityRecord({ entityType: entity, recordId });

  if (!existing) {
    return {
      ok: false as const,
      response: apiRecordNotFoundResponse(),
    };
  }

  try {
    const mutation = await buildPatchMutation({
      contractId,
      entity,
      existingRecord: existing,
      rawValues: parsed.body.values,
      recordId,
    });
    const record = await updateRecordInTransaction({
      appId,
      displayNameOverride: parsed.body.displayName,
      entity,
      existingRecord: existing,
      mutation,
      txClient: prisma,
      userId,
    });

    return { ok: true as const, recordId: record.id };
  } catch (error) {
    return mapApiWriteException(error);
  }
}

function parseCreateBody(body: unknown) {
  if (!isPlainObject(body)) {
    return writeError("INVALID_RECORD_BODY", "El body debe ser un objeto JSON.");
  }

  const clientRequestId = stringValue(body.clientRequestId)?.trim();

  if (!clientRequestId) {
    return writeError("INVALID_RECORD_BODY", "clientRequestId es obligatorio.");
  }

  const values = parseValuesObject(body.values);

  if (!values.ok) {
    return values;
  }

  const displayName = parseOptionalDisplayName(body.displayName);

  if (!displayName.ok) {
    return displayName;
  }

  return {
    ok: true as const,
    body: {
      clientRequestId,
      displayName: displayName.value,
      values: values.values,
    },
  };
}

function parsePatchBody(body: unknown) {
  if (!isPlainObject(body)) {
    return writeError("INVALID_RECORD_BODY", "El body debe ser un objeto JSON.");
  }

  const values = body.values === undefined ? { ok: true as const, values: {} } : parseValuesObject(body.values);

  if (!values.ok) {
    return values;
  }

  const displayName = parseOptionalDisplayName(body.displayName);

  if (!displayName.ok) {
    return displayName;
  }

  if (Object.keys(values.values).length === 0 && displayName.value === undefined) {
    return writeError("INVALID_RECORD_BODY", "Envía al menos displayName o values.");
  }

  return {
    ok: true as const,
    body: {
      displayName: displayName.value,
      values: values.values,
    },
  };
}

function parseValuesObject(value: unknown) {
  if (!isPlainObject(value)) {
    return writeError("INVALID_RECORD_BODY", "values debe ser un objeto JSON.");
  }

  return {
    ok: true as const,
    values: value,
  };
}

function parseOptionalDisplayName(value: unknown) {
  if (value === undefined) {
    return { ok: true as const, value: undefined };
  }

  if (value === null) {
    return { ok: true as const, value: null };
  }

  if (typeof value !== "string") {
    return writeError("INVALID_RECORD_BODY", "displayName debe ser string o null.");
  }

  return { ok: true as const, value: value.trim() || null };
}

async function buildCreateMutation({
  contractId,
  entity,
  rawValues,
}: {
  contractId: string;
  entity: ApiRecordEntity;
  rawValues: Record<string, unknown>;
}) {
  await assertWritableFieldKeys(entity, rawValues);
  const formData = apiValuesToFormData({ entity, rawValues });
  const values = await validateEntityValues({
    fields: entity.fields,
    formData,
    mode: "create",
  });
  const relations = await validateRelationValues({
    contractId,
    entityTypeId: entity.id,
    fields: entity.fields,
    formData,
  });

  return { relations, values };
}

async function buildPatchMutation({
  contractId,
  entity,
  existingRecord,
  rawValues,
  recordId,
}: {
  contractId: string;
  entity: ApiRecordEntity;
  existingRecord: Awaited<ReturnType<typeof getApiEntityRecord>>;
  rawValues: Record<string, unknown>;
  recordId: string;
}) {
  if (!existingRecord) {
    return { relations: [] as RelationInput[], values: [] as SerializedFieldValue[] };
  }

  await assertWritableFieldKeys(entity, rawValues);
  const formData = existingRecordToFormData(entity, existingRecord);
  applyApiValuesToFormData({ entity, formData, rawValues });
  const values = await validateEntityValues({
    fields: entity.fields,
    formData,
    mode: "edit",
    recordId,
  });
  const relations = await validateRelationValues({
    contractId,
    entityTypeId: entity.id,
    fields: entity.fields,
    formData,
    sourceRecordId: recordId,
  });

  return { relations, values };
}

function apiValuesToFormData({
  entity,
  rawValues,
}: {
  entity: ApiRecordEntity;
  rawValues: Record<string, unknown>;
}) {
  const formData = new FormData();
  applyApiValuesToFormData({ entity, formData, rawValues });

  return formData;
}

async function assertWritableFieldKeys(
  entity: ApiRecordEntity,
  rawValues: Record<string, unknown>,
) {
  const activeKeys = new Set(entity.fields.map((field) => field.key));
  const missingKeys = Object.keys(rawValues).filter((key) => !activeKeys.has(key));

  if (missingKeys.length === 0) {
    return;
  }

  const inactiveFields = await prisma.entityField.findMany({
    select: { key: true },
    where: {
      entityTypeId: entity.id,
      isActive: false,
      key: { in: missingKeys },
    },
  });
  const inactiveKeys = new Set(inactiveFields.map((field) => field.key));
  const inactiveKey = missingKeys.find((key) => inactiveKeys.has(key));

  if (inactiveKey) {
    throw apiInputError("INACTIVE_FIELD", `El campo ${inactiveKey} no está activo.`);
  }

  throw apiInputError("UNKNOWN_FIELD", `El campo ${missingKeys[0]} no existe.`);
}

function applyApiValuesToFormData({
  entity,
  formData,
  rawValues,
}: {
  entity: ApiRecordEntity;
  formData: FormData;
  rawValues: Record<string, unknown>;
}) {
  const fieldsByKey = new Map(entity.fields.map((field) => [field.key, field]));

  for (const [key, value] of Object.entries(rawValues)) {
    const field = fieldsByKey.get(key);

    if (!field) {
      throw apiInputError("UNKNOWN_FIELD", `El campo ${key} no existe.`);
    }

    formData.delete(fieldInputName(field.id));
    appendApiFieldValue(formData, field, value);
  }
}

function existingRecordToFormData(
  entity: ApiRecordEntity,
  record: NonNullable<Awaited<ReturnType<typeof getApiEntityRecord>>>,
) {
  const formData = new FormData();

  for (const field of entity.fields) {
    const value = record.values.find((item) => item.entityFieldId === field.id);
    const relations = record.outgoingRelations.filter((item) => item.sourceFieldId === field.id);

    appendExistingFieldValue(formData, field, value, relations);
  }

  return formData;
}

function appendApiFieldValue(formData: FormData, field: ApiWriteField, value: unknown) {
  const name = fieldInputName(field.id);

  if (value === null) {
    return;
  }

  if (
    field.type === "TEXT" ||
    field.type === "TEXTAREA" ||
    field.type === "EMAIL" ||
    field.type === "PHONE" ||
    field.type === "URL" ||
    field.type === "DATE" ||
    field.type === "DATETIME" ||
    field.type === "TIME" ||
    field.type === "SELECT"
  ) {
    if (typeof value !== "string") {
      throw apiInputError("INVALID_FIELD_VALUE", `${field.key} debe ser string.`);
    }
    formData.append(name, value);
    return;
  }

  if (field.type === "INTEGER") {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw apiInputError("INVALID_FIELD_VALUE", `${field.key} debe ser un número entero.`);
    }
    formData.append(name, String(value));
    return;
  }

  if (field.type === "DECIMAL" || field.type === "MONEY") {
    if (typeof value !== "string" && typeof value !== "number") {
      throw apiInputError("INVALID_FIELD_VALUE", `${field.key} debe ser un decimal string.`);
    }
    formData.append(name, String(value));
    return;
  }

  if (field.type === "BOOLEAN") {
    if (typeof value !== "boolean") {
      throw apiInputError("INVALID_FIELD_VALUE", `${field.key} debe ser boolean.`);
    }
    formData.append(name, value ? "true" : "false");
    return;
  }

  if (field.type === "MULTISELECT") {
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
      throw apiInputError("INVALID_FIELD_VALUE", `${field.key} debe ser un array de strings.`);
    }
    for (const item of value) {
      formData.append(name, item);
    }
    return;
  }

  if (field.type === "RELATION") {
    const values = Array.isArray(value) ? value : [value];
    if (!values.every((item) => typeof item === "string")) {
      throw apiInputError("INVALID_FIELD_VALUE", `${field.key} debe contener ids de registros.`);
    }
    for (const item of values) {
      formData.append(name, item);
    }
    return;
  }

  throw apiInputError("INVALID_FIELD_VALUE", `${field.key} no admite escritura API todavía.`);
}

function appendExistingFieldValue(
  formData: FormData,
  field: ApiWriteField,
  value: NonNullable<Awaited<ReturnType<typeof getApiEntityRecord>>>["values"][number] | undefined,
  relations: NonNullable<Awaited<ReturnType<typeof getApiEntityRecord>>>["outgoingRelations"],
) {
  const name = fieldInputName(field.id);

  if (field.type === "RELATION") {
    for (const relation of relations) {
      formData.append(name, relation.targetRecordId);
    }
    return;
  }

  if (!value) {
    return;
  }

  if (value.textValue != null) formData.append(name, value.textValue);
  if (value.integerValue != null) formData.append(name, String(value.integerValue));
  if (value.decimalValue != null) formData.append(name, value.decimalValue.toString());
  if (value.booleanValue != null) formData.append(name, value.booleanValue ? "true" : "false");
  if (value.dateValue != null) formData.append(name, field.type === "DATE" ? value.dateValue.toISOString().slice(0, 10) : value.dateValue.toISOString());
  if (Array.isArray(value.jsonValue)) {
    for (const item of value.jsonValue) {
      formData.append(name, String(item));
    }
  }
}

async function createRecordInTransaction({
  appId,
  displayNameOverride,
  entity,
  mutation,
  tx,
  userId,
}: {
  appId: string;
  displayNameOverride?: string | null;
  entity: ApiRecordEntity;
  mutation: { values: SerializedFieldValue[]; relations: RelationInput[] };
  tx: Prisma.TransactionClient;
  userId: string;
}) {
  const displayName = displayNameOverride || getRecordDisplayName(entity.fields, mutation.values);
  const valueChanges = buildValueChanges({
    fields: entity.fields,
    oldValues: [],
    newValues: mutation.values,
  });
  const relationChanges = await buildRelationChanges({
    contractId: entity.contractId,
    fields: entity.fields.filter((field) => field.type === "RELATION"),
    oldRelations: [],
    newRelations: mutation.relations,
  });
  const record = await tx.entityRecord.create({
    data: {
      displayName,
      entityTypeId: entity.id,
    },
  });

  await writeEntityValues(tx, record.id, mutation.values);
  await syncEntityRelations(tx, record.id, mutation.relations);
  await createAuditEvent(tx, {
    actorUserId: userId,
    action: "RECORD_CREATED",
    changes: [...valueChanges, ...relationChanges.added],
    contractId: entity.contractId,
    entityRecordId: record.id,
    entityTypeId: entity.id,
    metadata: {
      apiExternalAppId: appId,
      displayName: record.displayName,
      entityTypeName: entity.name,
    },
    summary: `Creó ${entity.name} ${record.displayName}`,
  });

  return record;
}

async function updateRecordInTransaction({
  appId,
  displayNameOverride,
  entity,
  existingRecord,
  mutation,
  txClient,
  userId,
}: {
  appId?: string;
  displayNameOverride?: string | null;
  entity: ApiRecordEntity;
  existingRecord: NonNullable<Awaited<ReturnType<typeof getApiEntityRecord>>>;
  mutation: { values: SerializedFieldValue[]; relations: RelationInput[] };
  txClient: typeof prisma;
  userId: string;
}) {
  const nextDisplayName = displayNameOverride || getRecordDisplayName(entity.fields, mutation.values);
  const valueChanges = buildValueChanges({
    fields: entity.fields,
    oldValues: existingRecord.values,
    newValues: mutation.values,
  });
  const relationChanges = await buildRelationChanges({
    contractId: entity.contractId,
    fields: entity.fields.filter((field) => field.type === "RELATION"),
    oldRelations: existingRecord.outgoingRelations,
    newRelations: mutation.relations,
  });
  const displayNameChanged = nextDisplayName !== existingRecord.displayName;

  if (
    !displayNameChanged &&
    valueChanges.length === 0 &&
    relationChanges.added.length === 0 &&
    relationChanges.removed.length === 0
  ) {
    return existingRecord;
  }

  return txClient.$transaction(async (tx) => {
    await tx.entityValue.deleteMany({
      where: {
        entityFieldId: { in: entity.fields.map((field) => field.id) },
        entityRecordId: existingRecord.id,
      },
    });
    await writeEntityValues(tx, existingRecord.id, mutation.values);
    await syncEntityRelations(tx, existingRecord.id, mutation.relations);
    const updatedRecord = await tx.entityRecord.update({
      data: { displayName: nextDisplayName },
      where: { id: existingRecord.id },
    });

    await createAuditEvent(tx, {
      actorUserId: userId,
      action: "RECORD_UPDATED",
      changes: valueChanges,
      contractId: entity.contractId,
      entityRecordId: existingRecord.id,
      entityTypeId: entity.id,
      metadata: {
        apiExternalAppId: appId,
        displayName: updatedRecord.displayName,
        displayNameChanged,
        entityTypeName: entity.name,
      },
      summary: `Actualizó ${entity.name} ${updatedRecord.displayName}`,
    });

    if (relationChanges.added.length > 0) {
      await createAuditEvent(tx, {
        actorUserId: userId,
        action: "RELATION_ADDED",
        changes: relationChanges.added,
        contractId: entity.contractId,
        entityRecordId: existingRecord.id,
        entityTypeId: entity.id,
        metadata: {
          apiExternalAppId: appId,
          displayName: updatedRecord.displayName,
          entityTypeName: entity.name,
        },
        summary: `Agregó relaciones en ${entity.name} ${updatedRecord.displayName}`,
      });
    }

    if (relationChanges.removed.length > 0) {
      await createAuditEvent(tx, {
        actorUserId: userId,
        action: "RELATION_REMOVED",
        changes: relationChanges.removed,
        contractId: entity.contractId,
        entityRecordId: existingRecord.id,
        entityTypeId: entity.id,
        metadata: {
          apiExternalAppId: appId,
          displayName: updatedRecord.displayName,
          entityTypeName: entity.name,
        },
        summary: `Quitó relaciones en ${entity.name} ${updatedRecord.displayName}`,
      });
    }

    return updatedRecord;
  });
}

async function writeEntityValues(
  tx: Prisma.TransactionClient,
  recordId: string,
  values: SerializedFieldValue[],
) {
  const nonEmptyValues = values.filter((value) => !isEmptySerializedValue(value));

  if (nonEmptyValues.length === 0) {
    return;
  }

  await tx.entityValue.createMany({
    data: nonEmptyValues.map((value) => ({
      booleanValue: value.booleanValue ?? null,
      dateValue: value.dateValue ?? null,
      decimalValue: value.decimalValue ?? null,
      entityFieldId: value.fieldId,
      entityRecordId: recordId,
      integerValue: value.integerValue ?? null,
      jsonValue: value.jsonValue ?? Prisma.JsonNull,
      textValue: value.textValue ?? null,
    })),
  });
}

async function resolveIdempotentReplay({
  appId,
  clientRequestId,
  operation,
  requestHash,
}: {
  appId: string;
  clientRequestId: string;
  operation: string;
  requestHash: string;
}) {
  const existing = await prisma.apiIdempotencyKey.findUnique({
    select: {
      entityRecordId: true,
      requestHash: true,
    },
    where: {
      externalAppId_operation_clientRequestId: {
        clientRequestId,
        externalAppId: appId,
        operation,
      },
    },
  });

  if (!existing) {
    return {
      ok: false as const,
      response: internalError(
        "No se pudo resolver la idempotencia",
        "IDEMPOTENCY_RESOLUTION_FAILED",
      ),
    };
  }

  if (existing.requestHash !== requestHash) {
    return {
      ok: false as const,
      response: conflict(
        "clientRequestId ya fue usado con otro payload.",
        "IDEMPOTENCY_CONFLICT",
      ),
    };
  }

  if (!existing.entityRecordId) {
    return {
      ok: false as const,
      response: internalError("Solicitud idempotente incompleta", "IDEMPOTENCY_PENDING"),
    };
  }

  return {
    ok: true as const,
    replay: true as const,
    recordId: existing.entityRecordId,
  };
}

function isUniqueIdempotencyConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes("externalAppId") &&
    error.meta.target.includes("clientRequestId")
  );
}

function mapApiWriteException(error: unknown) {
  if (error instanceof ApiRecordInputError) {
    return writeError(error.code, error.message);
  }

  if (error instanceof FieldValidationError) {
    return writeError("INVALID_FIELD_VALUE", "Uno o más campos tienen valores inválidos.");
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return writeError("UNIQUE_CONSTRAINT", "Existe otro registro con un valor único igual.");
  }

  if (error instanceof Error && error.name === "UserFacingError") {
    return writeError("INVALID_RELATION", error.message);
  }

  throw error;
}

function writeError(code: string, message: string) {
  return {
    ok: false as const,
    response: badRequest(message, code),
  };
}

class ApiRecordInputError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiRecordInputError";
    this.code = code;
  }
}

function apiInputError(code: string, message: string) {
  return new ApiRecordInputError(code, message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function fieldInputName(fieldId: string) {
  return `field_${fieldId}`;
}

export function apiWriteEntityNotFound() {
  return {
    ok: false as const,
    response: apiEntityNotFoundResponse(),
  };
}
