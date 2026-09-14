import { FieldValidationError } from "@/lib/field-validation";
import {
  findUniqueFieldConflict,
  isUniqueFieldValidationSupported,
  normalizeUniqueFieldValue,
} from "@/lib/entity-records";
import { prisma } from "@/lib/prisma";
import type { ApiRecordEntity } from "@/lib/api-entities";

const maxUniqueValidationFields = 20;
const maxUniqueValidationValueBytes = 8_000;

export type ValidateApiRecordUniqueBody = {
  fields?: {
    fieldId?: string;
    value?: unknown;
  }[];
  recordId?: string | null;
};

export type ApiRecordUniqueValidationConflict = {
  conflictingRecordId: string | null;
  fieldId: string;
  fieldName: string;
  message: string;
  rejectedValue: string | number | boolean | null | (string | number | boolean | null)[];
};

export type ApiRecordUniqueValidationResult = {
  available: boolean;
  conflicts: ApiRecordUniqueValidationConflict[];
};

export async function validateApiRecordUniqueFields({
  body,
  entity,
}: {
  body: unknown;
  entity: ApiRecordEntity;
}): Promise<
  | { ok: true; result: ApiRecordUniqueValidationResult }
  | { code: string; message: string; ok: false }
> {
  const parsed = parseValidateUniqueBody(body);

  if (!parsed.ok) {
    return parsed;
  }

  if (parsed.body.recordId) {
    const record = await prisma.entityRecord.findFirst({
      select: { id: true },
      where: {
        entityType: {
          contractId: entity.contractId,
        },
        entityTypeId: entity.id,
        id: parsed.body.recordId,
      },
    });

    if (!record) {
      return { code: "INVALID_UNIQUE_VALIDATION_BODY", message: "recordId no pertenece a esta entidad.", ok: false };
    }
  }

  const conflicts: ApiRecordUniqueValidationConflict[] = [];

  for (const requestedField of parsed.body.fields) {
    const field = entity.fields.find((item) => item.id === requestedField.fieldId);

    if (!field) {
      return { code: "INVALID_UNIQUE_VALIDATION_BODY", message: "El campo indicado no existe en esta entidad.", ok: false };
    }

    if (!field.isUnique) {
      return { code: "INVALID_UNIQUE_VALIDATION_BODY", message: `${field.name} no esta configurado como unico.`, ok: false };
    }

    if (!isUniqueFieldValidationSupported(field)) {
      return { code: "INVALID_UNIQUE_VALIDATION_BODY", message: `${field.name} no admite validacion preventiva de unicidad.`, ok: false };
    }

    let value;
    try {
      value = normalizeUniqueFieldValue(field, requestedField.value);
    } catch (error) {
      if (error instanceof FieldValidationError) {
        return { code: "INVALID_FIELD_VALUE", message: "Uno o mas campos tienen valores invalidos.", ok: false };
      }

      throw error;
    }

    const conflict = await findUniqueFieldConflict({
      entityTypeId: entity.id,
      field: { ...field, isUnique: true },
      recordId: parsed.body.recordId,
      value,
    });

    if (conflict) {
      conflicts.push({
        conflictingRecordId: conflict.conflictingRecordId,
        fieldId: conflict.fieldId,
        fieldName: conflict.fieldName,
        message: `Ya existe un registro con este valor en "${conflict.fieldName}".`,
        rejectedValue: conflict.rejectedValue,
      });
    }
  }

  return {
    ok: true,
    result: {
      available: conflicts.length === 0,
      conflicts,
    },
  };
}

function parseValidateUniqueBody(body: unknown):
  | { body: Required<Pick<ValidateApiRecordUniqueBody, "fields">> & { recordId?: string | null }; ok: true }
  | { code: string; message: string; ok: false } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { code: "INVALID_UNIQUE_VALIDATION_BODY", message: "El body debe ser un objeto JSON.", ok: false };
  }

  const raw = body as ValidateApiRecordUniqueBody;
  const recordId = typeof raw.recordId === "string" && raw.recordId.trim()
    ? raw.recordId.trim()
    : null;

  if (!Array.isArray(raw.fields)) {
    return { code: "INVALID_UNIQUE_VALIDATION_BODY", message: "fields debe ser un arreglo.", ok: false };
  }

  if (raw.fields.length === 0) {
    return { code: "INVALID_UNIQUE_VALIDATION_BODY", message: "Debes enviar al menos un campo unico.", ok: false };
  }

  if (raw.fields.length > maxUniqueValidationFields) {
    return { code: "INVALID_UNIQUE_VALIDATION_BODY", message: `Puedes validar hasta ${maxUniqueValidationFields} campos por solicitud.`, ok: false };
  }

  const fields = raw.fields.map((field) => ({
    fieldId: typeof field?.fieldId === "string" ? field.fieldId.trim() : "",
    value: field?.value,
  }));

  if (fields.some((field) => !field.fieldId)) {
    return { code: "INVALID_UNIQUE_VALIDATION_BODY", message: "Cada campo debe incluir fieldId.", ok: false };
  }

  const repeatedFieldId = fields.find((field, index) =>
    fields.findIndex((candidate) => candidate.fieldId === field.fieldId) !== index
  );

  if (repeatedFieldId) {
    return { code: "INVALID_UNIQUE_VALIDATION_BODY", message: "Cada campo unico debe enviarse una sola vez.", ok: false };
  }

  if (fields.some((field) => JSON.stringify(field.value ?? null).length > maxUniqueValidationValueBytes)) {
    return { code: "INVALID_UNIQUE_VALIDATION_BODY", message: "El valor enviado para validar es demasiado grande.", ok: false };
  }

  return { body: { fields, recordId }, ok: true };
}
