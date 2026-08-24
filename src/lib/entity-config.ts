import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getAuthorizedContractAdmin } from "./contracts";
import {
  buildMergedFieldConfig,
  buildMergedFieldDisplayConfig,
  getRecordDisplayName,
  parseFieldConfig,
  type FieldDisplayConfig,
  type FieldErrorMap,
  type FieldValidationRules,
  type SerializedFieldValue,
} from "./field-validation";
import {
  multipleFieldTypes,
  FIELD_OPTIONS_PAYLOAD_NAME,
  MAX_FIELD_OPTIONS,
  MAX_FIELD_OPTIONS_MESSAGE,
  optionFieldTypes,
  parseFieldOptionsPayload,
  supportedEntityFieldTypes,
  validateOptionDrafts,
  type FieldOptionDraft,
} from "./field-editor-state";
import { keyify, slugify } from "./format";
import { getReorderedEntityFieldUpdates, orderEntityFields } from "./entity-field-order";
import { isEntityIconKey } from "./entity-icons";
import { entityNatureValues } from "./entity-nature";
import { prisma } from "./prisma";
import { parseMoneyCurrency } from "./money";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const keyRegex = /^[a-z][a-z0-9_]*$/;
const relationKinds = ["ONE", "MANY"] as const;
type PrismaClientLike = typeof prisma | Prisma.TransactionClient;
const displayNameRecalculationBatchSize = 500;

export const entityTypeSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "El slug debe tener al menos 2 caracteres.")
    .regex(slugRegex, "Usa solo minúsculas, números y guiones."),
  description: z.string().trim().optional(),
  icon: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .refine((value) => value === undefined || isEntityIconKey(value), {
      message: "Selecciona un icono válido.",
    }),
  nature: z.enum(entityNatureValues).default("MASTER"),
  isActive: z.boolean(),
});

export const entityFieldSchema = z
  .object({
    name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
    key: z
      .string()
      .trim()
      .toLowerCase()
      .min(2, "La key debe tener al menos 2 caracteres.")
      .regex(keyRegex, "Usa minúsculas, números y guion bajo; empieza con letra."),
    description: z.string().trim().optional(),
    type: z.enum(supportedEntityFieldTypes),
    required: z.boolean(),
    isUnique: z.boolean(),
    searchable: z.boolean(),
    multiple: z.boolean(),
    isActive: z.boolean(),
    targetEntityTypeId: z.string().trim().optional(),
    relationKind: z.enum(relationKinds).optional(),
    validation: z.object({
      required: z.boolean().optional(),
      minLength: z.number().int().min(0).optional(),
      maxLength: z.number().int().min(0).optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      regex: z
        .object({
          pattern: z.string().trim().min(1),
          message: z.string().trim().optional(),
        })
        .optional(),
    }),
    defaultValue: z.unknown().optional(),
    display: z.object({
      primary: z.boolean().optional(),
      showInList: z.boolean().optional(),
      listOrder: z.number().int().min(0).optional(),
    }),
    money: z.object({
      currency: z.enum(["CLP", "USD", "EUR", "UF"]),
    }),
  })
  .superRefine((value, ctx) => {
    if (value.multiple && !multipleFieldTypes.has(value.type)) {
      ctx.addIssue({
        code: "custom",
        message: "Este tipo de campo no soporta valores múltiples.",
        path: ["multiple"],
      });
    }

    if (value.type === "RELATION" && !value.targetEntityTypeId) {
      ctx.addIssue({
        code: "custom",
        message: "Selecciona el tipo de entidad relacionado.",
        path: ["targetEntityTypeId"],
      });
    }
  });

export const fieldOptionSchema = z.object({
  label: z.string().trim().min(1, "El label es obligatorio."),
  value: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "El value es obligatorio.")
    .regex(keyRegex, "Usa minúsculas, números y guion bajo; empieza con letra."),
  sortOrder: z.coerce.number().int().min(0),
  isActive: z.boolean(),
});

export { keyify, slugify };

export class FieldEditorInputError extends Error {
  fieldErrors: FieldErrorMap;

  constructor(message: string, fieldErrors: FieldErrorMap) {
    super(message);
    this.name = "FieldEditorInputError";
    this.fieldErrors = fieldErrors;
  }
}

export function parseFormBoolean(formData: FormData, key: string, defaultValue = false) {
  const values = formData.getAll(key);

  if (values.length === 0) {
    return defaultValue;
  }

  for (const value of values.slice().reverse()) {
    if (typeof value !== "string") {
      continue;
    }

    const normalized = value.trim().toLowerCase();

    if (normalized === "true" || normalized === "on" || normalized === "1") {
      return true;
    }

    if (
      normalized === "false" ||
      normalized === "off" ||
      normalized === "0" ||
      normalized === ""
    ) {
      return false;
    }
  }

  return defaultValue;
}

export function formBoolean(formData: FormData, key: string) {
  return parseFormBoolean(formData, key);
}

export function getEntityTypeInput(formData: FormData) {
  return entityTypeSchema.parse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description") || undefined,
    icon: formData.get("icon") || undefined,
    nature: formData.get("nature") || undefined,
    isActive: parseFormBoolean(formData, "isActive"),
  });
}

export function getEntityFieldInput(formData: FormData) {
  const type = String(formData.get("type") ?? "TEXT");
  const validation = getFieldValidationInput(formData);
  const display = getFieldDisplayInput(formData);

  return entityFieldSchema.parse({
    name: formData.get("name"),
    key: formData.get("key"),
    description: formData.get("description") || undefined,
    type,
    required: validation.required ?? parseFormBoolean(formData, "required"),
    isUnique: parseFormBoolean(formData, "isUnique"),
    searchable: parseFormBoolean(formData, "searchable"),
    multiple: parseFormBoolean(formData, "multiple"),
    isActive: parseFormBoolean(formData, "isActive"),
    targetEntityTypeId: formData.get("targetEntityTypeId") || undefined,
    relationKind: formData.get("relationKind") || undefined,
    validation,
    defaultValue: getDefaultValueInput(formData, type),
    display,
    money: {
      currency: parseMoneyCurrency(formData.get("moneyCurrency")),
    },
  });
}

export function getFieldOptionInput(formData: FormData) {
  return fieldOptionSchema.parse({
    label: formData.get("label"),
    value: formData.get("value"),
    sortOrder: formData.get("sortOrder") || 0,
    isActive: parseFormBoolean(formData, "isActive"),
  });
}

export function getEntityFieldEditorInput(formData: FormData) {
  const field = getEntityFieldInput(formData);
  const options = getFieldOptionRowsInput(formData);

  if (optionFieldTypes.has(field.type)) {
    const validated = validateOptionDrafts(options);

    if (!validated.success) {
      throw new FieldEditorInputError(
        "Revisa las opciones antes de guardar.",
        validated.fieldErrors,
      );
    }

    return { field, options: validated.validOptions };
  }

  return { field, options: [] };
}

function getFieldOptionRowsInput(formData: FormData): FieldOptionDraft[] {
  const structuredPayload = parseFieldOptionsPayload(formData.get(FIELD_OPTIONS_PAYLOAD_NAME));

  if (structuredPayload) {
    if (structuredPayload.length > MAX_FIELD_OPTIONS) {
      throw new FieldEditorInputError("Revisa las opciones antes de guardar.", {
        options: [MAX_FIELD_OPTIONS_MESSAGE],
      });
    }

    return structuredPayload;
  }

  const rowKeys = formData
    .getAll("optionRowKey")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (rowKeys.length > MAX_FIELD_OPTIONS) {
    throw new FieldEditorInputError("Revisa las opciones antes de guardar.", {
      options: [MAX_FIELD_OPTIONS_MESSAGE],
    });
  }

  return rowKeys.map((rowKey, index) => ({
      id: optionalString(formData.get(`optionId:${rowKey}`)),
      label: String(formData.get(`optionLabel:${rowKey}`) ?? "").trim(),
      value: String(formData.get(`optionValue:${rowKey}`) ?? "").trim().toLowerCase(),
      sortOrder:
        optionalInteger(formData.get(`optionSortOrder:${rowKey}`)) ?? index + 1,
      isActive: parseFormBoolean(formData, `optionActive:${rowKey}`),
    }));
}

function getFieldValidationInput(formData: FormData): FieldValidationRules {
  const regexPattern = optionalString(formData.get("validationRegexPattern"));
  const regexMessage = optionalString(formData.get("validationRegexMessage"));

  return {
    required: parseFormBoolean(formData, "required"),
    minLength: optionalInteger(formData.get("validationMinLength")),
    maxLength: optionalInteger(formData.get("validationMaxLength")),
    minimum: optionalNumber(formData.get("validationMinimum")),
    maximum: optionalNumber(formData.get("validationMaximum")),
    regex: regexPattern
      ? {
          pattern: regexPattern,
          message: regexMessage,
        }
      : undefined,
  };
}

function getDefaultValueInput(formData: FormData, type: string) {
  if (type === "MULTISELECT") {
    const values = formData
      .getAll("validationDefaultValue")
      .map((value) => String(value).trim())
      .filter(Boolean);

    return values.length > 0 ? values : undefined;
  }

  if (type === "BOOLEAN") {
    const value = formData.get("validationDefaultValue");

    return value === "true" || value === "false" ? value : undefined;
  }

  return optionalString(formData.get("validationDefaultValue"));
}

function getFieldDisplayInput(formData: FormData): FieldDisplayConfig {
  return {
    primary: parseFormBoolean(formData, "displayPrimary"),
    showInList:
      parseFormBoolean(formData, "displayPrimary") ||
      parseFormBoolean(formData, "displayShowInList"),
    listOrder: optionalInteger(formData.get("displayListOrder")),
  };
}

function optionalString(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";

  return text || undefined;
}

function optionalInteger(value: FormDataEntryValue | null) {
  const text = optionalString(value);

  if (!text) {
    return undefined;
  }

  return z.coerce.number().int().min(0).parse(text);
}

function optionalNumber(value: FormDataEntryValue | null) {
  const text = optionalString(value);

  if (!text) {
    return undefined;
  }

  return z.coerce.number().parse(text);
}

function userError(message: string) {
  const error = new Error(message);
  error.name = "UserFacingError";

  return error;
}

export function friendlyActionError(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Revisa los datos del formulario.";
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(", ")
        : "valor";

      if (target.includes("slug")) {
        return "Ya existe un tipo de entidad con ese slug en este contrato.";
      }

      if (target.includes("name")) {
        return "Ya existe un tipo de entidad con ese nombre en este contrato.";
      }

      if (target.includes("key")) {
        return "Ya existe un campo con esa key en este tipo de entidad.";
      }

      if (target.includes("value")) {
        return "Ya existe una opción con ese value en este campo.";
      }

      return "Ya existe un registro con esos datos.";
    }
  }

  if (error instanceof Error && error.name === "UserFacingError") {
    return error.message;
  }

  if (error instanceof Error && error.name === "FieldValidationError") {
    return "Revisa las validaciones marcadas en el formulario.";
  }

  if (error instanceof Error && error.name === "FieldEditorInputError") {
    return error.message;
  }

  return "No se pudo completar la operación.";
}

export async function getContractEntityTypes(contractId: string, userId: string) {
  const contract = await getAuthorizedContractAdmin(contractId, userId);

  if (!contract) {
    return null;
  }

  const entityTypes = await prisma.entityType.findMany({
    where: { contractId: contract.id },
    include: {
      _count: {
        select: {
          fields: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return { contract, entityTypes };
}

export async function getAuthorizedEntityType(
  contractId: string,
  entityTypeId: string,
  userId: string,
) {
  const contract = await getAuthorizedContractAdmin(contractId, userId);

  if (!contract) {
    return null;
  }

  const entityType = await prisma.entityType.findFirst({
    where: {
      id: entityTypeId,
      contractId: contract.id,
    },
    include: {
      fields: {
        include: {
          options: {
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          },
          _count: {
            select: {
              auditChanges: true,
              values: true,
              relations: true,
            },
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

export async function createEntityType(
  contractId: string,
  userId: string,
  input: z.infer<typeof entityTypeSchema>,
) {
  const contract = await getAuthorizedContractAdmin(contractId, userId);

  if (!contract) {
    return null;
  }

  return prisma.entityType.create({
    data: {
      contractId: contract.id,
      name: input.name,
      slug: input.slug,
      description: input.description || null,
      icon: input.icon || null,
      nature: input.nature,
      isActive: input.isActive,
    },
  });
}

export async function updateEntityType(
  contractId: string,
  entityTypeId: string,
  userId: string,
  input: z.infer<typeof entityTypeSchema>,
) {
  const authorized = await getAuthorizedEntityType(contractId, entityTypeId, userId);

  if (!authorized) {
    return null;
  }

  return prisma.entityType.update({
    where: { id: authorized.entityType.id },
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description || null,
      icon: input.icon || null,
      nature: input.nature,
      isActive: input.isActive,
    },
  });
}

export async function setEntityTypeActive(
  contractId: string,
  entityTypeId: string,
  userId: string,
  isActive: boolean,
) {
  const authorized = await getAuthorizedEntityType(contractId, entityTypeId, userId);

  if (!authorized) {
    return null;
  }

  return prisma.entityType.update({
    where: { id: authorized.entityType.id },
    data: { isActive },
  });
}

export async function createEntityField(
  contractId: string,
  entityTypeId: string,
  userId: string,
  input: z.infer<typeof entityFieldSchema>,
) {
  const authorized = await getAuthorizedEntityType(contractId, entityTypeId, userId);

  if (!authorized) {
    return null;
  }

  const highestField = await prisma.entityField.findFirst({
    where: { entityTypeId: authorized.entityType.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  await validateRelationTarget(authorized.contract.id, input);
  validatePrimaryInput(input);

  return prisma.$transaction(async (tx) => {
    if (input.display.primary) {
      await unsetPrimaryFields(tx, authorized.entityType.fields);
    }

    const field = await tx.entityField.create({
      data: {
        entityTypeId: authorized.entityType.id,
        name: input.name,
        key: input.key,
        description: input.description || null,
        type: input.type,
        required: input.validation.required ?? input.required,
        isUnique: input.isUnique,
        searchable: input.searchable,
        multiple: input.multiple,
        sortOrder: (highestField?.sortOrder ?? 0) + 1,
        config: buildFieldConfig(input),
        isActive: input.isActive,
      },
    });

    if (input.display.primary) {
      await recalculateEntityTypeDisplayNames(
        tx,
        authorized.entityType.id,
        withPrimaryDisplayNameField(authorized.entityType.fields, field),
      );
    }

    return field;
  });
}

export async function createEntityFieldWithOptions(
  contractId: string,
  entityTypeId: string,
  userId: string,
  input: z.infer<typeof entityFieldSchema>,
  options: FieldOptionDraft[],
) {
  const authorized = await getAuthorizedEntityType(contractId, entityTypeId, userId);

  if (!authorized) {
    return null;
  }

  const highestField = await prisma.entityField.findFirst({
    where: { entityTypeId: authorized.entityType.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  await validateRelationTarget(authorized.contract.id, input);
  validatePrimaryInput(input);

  return prisma.$transaction(async (tx) => {
    if (input.display.primary) {
      await unsetPrimaryFields(tx, authorized.entityType.fields);
    }

    const field = await tx.entityField.create({
      data: {
        entityTypeId: authorized.entityType.id,
        name: input.name,
        key: input.key,
        description: input.description || null,
        type: input.type,
        required: input.validation.required ?? input.required,
        isUnique: input.isUnique,
        searchable: input.searchable,
        multiple: input.multiple,
        sortOrder: (highestField?.sortOrder ?? 0) + 1,
        config: buildFieldConfig(
          input,
          undefined,
          options.map((option) => option.value),
        ),
        isActive: input.isActive,
      },
    });

    if (optionFieldTypes.has(input.type)) {
      await tx.fieldOption.createMany({
        data: options.map((option, index) => ({
          entityFieldId: field.id,
          label: option.label,
          value: option.value,
          sortOrder: option.sortOrder || index + 1,
          isActive: option.isActive,
        })),
      });
    }

    if (input.display.primary) {
      await recalculateEntityTypeDisplayNames(
        tx,
        authorized.entityType.id,
        withPrimaryDisplayNameField(authorized.entityType.fields, {
          ...field,
          options: options.map((option, index) => ({
            id: option.id ?? `new_option_${index}`,
            label: option.label,
            value: option.value,
            sortOrder: option.sortOrder || index + 1,
            isActive: option.isActive,
          })),
        }),
      );
    }

    return field;
  });
}

export async function updateEntityField(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  userId: string,
  input: z.infer<typeof entityFieldSchema>,
) {
  const authorized = await getAuthorizedEntityType(contractId, entityTypeId, userId);

  if (!authorized) {
    return null;
  }

  const field = authorized.entityType.fields.find((item) => item.id === fieldId);

  if (!field) {
    return null;
  }

  await validateRelationTarget(authorized.contract.id, input);
  validatePrimaryInput(input);
  await validateTypeChange(field, input.type);
  const wasPrimary = parseFieldConfig(field.config).display.primary === true;

  return prisma.$transaction(async (tx) => {
    if (input.display.primary) {
      await unsetPrimaryFields(
        tx,
        authorized.entityType.fields.filter((item) => item.id !== field.id),
      );
    }

    const updated = await tx.entityField.update({
      where: { id: field.id },
      data: {
        name: input.name,
        key: input.key,
        description: input.description || null,
        type: input.type,
        required: input.validation.required ?? input.required,
        isUnique: input.isUnique,
        searchable: input.searchable,
        multiple: input.multiple,
        config: buildFieldConfig(input, field.config, field.options.map((option) => option.value)),
        isActive: input.isActive,
      },
    });

    if (wasPrimary || input.display.primary) {
      await recalculateEntityTypeDisplayNames(
        tx,
        authorized.entityType.id,
        replaceDisplayNameField(
          authorized.entityType.fields,
          { ...updated, options: field.options },
          input.display.primary === true,
        ),
      );
    }

    return updated;
  });
}

export async function updateEntityFieldWithOptions(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  userId: string,
  input: z.infer<typeof entityFieldSchema>,
  options: FieldOptionDraft[],
) {
  const authorized = await getAuthorizedEntityType(contractId, entityTypeId, userId);

  if (!authorized) {
    return null;
  }

  const field = authorized.entityType.fields.find((item) => item.id === fieldId);

  if (!field) {
    return null;
  }

  await validateRelationTarget(authorized.contract.id, input);
  validatePrimaryInput(input);
  await validateTypeChange(field, input.type);
  await validateOptionValueChanges(field, options);
  const wasPrimary = parseFieldConfig(field.config).display.primary === true;

  return prisma.$transaction(async (tx) => {
    if (input.display.primary) {
      await unsetPrimaryFields(
        tx,
        authorized.entityType.fields.filter((item) => item.id !== field.id),
      );
    }

    const optionValues = optionFieldTypes.has(input.type)
      ? options.map((option) => option.value)
      : field.options.map((option) => option.value);
    const updated = await tx.entityField.update({
      where: { id: field.id },
      data: {
        name: input.name,
        key: input.key,
        description: input.description || null,
        type: input.type,
        required: input.validation.required ?? input.required,
        isUnique: input.isUnique,
        searchable: input.searchable,
        multiple: input.multiple,
        config: buildFieldConfig(input, field.config, optionValues),
        isActive: input.isActive,
      },
    });

    if (optionFieldTypes.has(input.type)) {
      await syncFieldOptions(tx, field.id, options);
    }

    if (wasPrimary || input.display.primary) {
      await recalculateEntityTypeDisplayNames(
        tx,
        authorized.entityType.id,
        replaceDisplayNameField(
          authorized.entityType.fields,
          {
            ...updated,
            options: optionFieldTypes.has(input.type)
              ? options.map((option, index) => ({
                  id: option.id ?? `new_option_${index}`,
                  label: option.label,
                  value: option.value,
                  sortOrder: option.sortOrder || index + 1,
                  isActive: option.isActive,
                }))
              : field.options,
          },
          input.display.primary === true,
        ),
      );
    }

    return updated;
  });
}

async function syncFieldOptions(
  tx: Prisma.TransactionClient,
  fieldId: string,
  options: FieldOptionDraft[],
) {
  const existingOptions = options
    .map((option, index) => ({
      ...option,
      sortOrder: option.sortOrder || index + 1,
    }))
    .filter((option): option is FieldOptionDraft & { id: string; sortOrder: number } =>
      Boolean(option.id),
    );
  const newOptions = options
    .map((option, index) => ({
      ...option,
      sortOrder: option.sortOrder || index + 1,
    }))
    .filter((option) => !option.id);

  if (existingOptions.length > 0) {
    await tx.$executeRaw`
      UPDATE "FieldOption" AS option
      SET
        "label" = data."label",
        "value" = data."value",
        "sortOrder" = data."sortOrder",
        "isActive" = data."isActive"
      FROM (
        VALUES ${Prisma.join(
          existingOptions.map((option) =>
            Prisma.sql`(${option.id}, ${option.label}, ${option.value}, ${option.sortOrder}, ${option.isActive})`,
          ),
        )}
      ) AS data("id", "label", "value", "sortOrder", "isActive")
      WHERE option."id" = data."id"
        AND option."entityFieldId" = ${fieldId}
    `;
  }

  if (newOptions.length > 0) {
    await tx.fieldOption.createMany({
      data: newOptions.map((option) => ({
        entityFieldId: fieldId,
        label: option.label,
        value: option.value,
        sortOrder: option.sortOrder,
        isActive: option.isActive,
      })),
    });
  }
}

export async function setEntityFieldActive(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  userId: string,
  isActive: boolean,
) {
  const authorized = await getAuthorizedEntityType(contractId, entityTypeId, userId);

  if (!authorized?.entityType.fields.some((field) => field.id === fieldId)) {
    return null;
  }

  const field = authorized.entityType.fields.find((item) => item.id === fieldId);
  if (field && !isActive && parseFieldConfig(field.config).display.primary) {
    throw userError("Quita Campo principal antes de desactivar este campo.");
  }

  return prisma.entityField.update({
    where: { id: fieldId },
    data: { isActive },
  });
}

export type EntityFieldDeletionReasonCode =
  | "HAS_VALUES"
  | "HAS_RELATIONS"
  | "HAS_AUDIT_HISTORY";

export type EntityFieldDeletionSafety = {
  canDelete: boolean;
  reasons: Array<{
    code: EntityFieldDeletionReasonCode;
    count: number;
    message: string;
  }>;
  counts: {
    auditChanges: number;
    relations: number;
    values: number;
  };
};

type EntityFieldUsageCounts = {
  auditChanges: number;
  relations: number;
  values: number;
};

export function getEntityFieldDeletionSafetyFromCounts(
  counts: EntityFieldUsageCounts,
): EntityFieldDeletionSafety {
  const reasons: EntityFieldDeletionSafety["reasons"] = [];

  if (counts.values > 0) {
    reasons.push({
      code: "HAS_VALUES",
      count: counts.values,
      message: "Tiene valores históricos asociados.",
    });
  }

  if (counts.relations > 0) {
    reasons.push({
      code: "HAS_RELATIONS",
      count: counts.relations,
      message: "Tiene relaciones históricas asociadas.",
    });
  }

  if (counts.auditChanges > 0) {
    reasons.push({
      code: "HAS_AUDIT_HISTORY",
      count: counts.auditChanges,
      message: "Tiene auditoría histórica asociada.",
    });
  }

  return {
    canDelete: reasons.length === 0,
    reasons,
    counts,
  };
}

export async function getEntityFieldDeletionSafety(
  fieldId: string,
  client: PrismaClientLike = prisma,
) {
  const [values, relations, auditChanges] = await Promise.all([
    client.entityValue.count({ where: { entityFieldId: fieldId } }),
    client.entityRelation.count({ where: { sourceFieldId: fieldId } }),
    client.auditChange.count({ where: { entityFieldId: fieldId } }),
  ]);

  return getEntityFieldDeletionSafetyFromCounts({
    auditChanges,
    relations,
    values,
  });
}

export async function deleteUnusedEntityField(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  userId: string,
) {
  const authorized = await getAuthorizedEntityType(contractId, entityTypeId, userId);

  if (!authorized) {
    return null;
  }

  return prisma.$transaction(
    async (tx) => {
      const field = await tx.entityField.findFirst({
        where: {
          id: fieldId,
          entityTypeId: authorized.entityType.id,
          entityType: {
            contractId: authorized.contract.id,
          },
        },
        select: {
          id: true,
          name: true,
          key: true,
          type: true,
          _count: {
            select: {
              auditChanges: true,
              relations: true,
              values: true,
            },
          },
        },
      });

      if (!field) {
        return null;
      }

      const safety = getEntityFieldDeletionSafetyFromCounts(field._count);

      if (!safety.canDelete) {
        throw userError(getEntityFieldDeletionBlockedMessage(safety));
      }

      await tx.fieldOption.deleteMany({
        where: { entityFieldId: field.id },
      });
      await tx.entityField.delete({
        where: { id: field.id },
      });

      return field;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export function getEntityFieldDeletionBlockedMessage(
  safety: EntityFieldDeletionSafety,
) {
  const messages = safety.reasons.map((reason) => reason.message);

  return messages.length > 0
    ? `No puedes eliminar este campo porque ${messages.join(" ")} Puedes desactivarlo para que deje de estar disponible en nuevos registros.`
    : "No puedes eliminar este campo.";
}

export async function reorderEntityFields(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  userId: string,
  direction: "up" | "down",
) {
  const authorized = await getAuthorizedEntityType(contractId, entityTypeId, userId);

  if (!authorized) {
    return null;
  }

  const updates = getReorderedEntityFieldUpdates(
    authorized.entityType.fields,
    fieldId,
    direction,
  );

  if (updates.length === 0) {
    return null;
  }

  await prisma.$transaction(
    updates.map((update) =>
      prisma.entityField.update({
        where: { id: update.id },
        data: { sortOrder: update.sortOrder },
      }),
    ),
  );

  return true;
}

export async function createFieldOption(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  userId: string,
  input: z.infer<typeof fieldOptionSchema>,
) {
  const field = await getAuthorizedOptionField(contractId, entityTypeId, fieldId, userId);

  if (!field) {
    return null;
  }

  return prisma.fieldOption.create({
    data: {
      entityFieldId: field.id,
      label: input.label,
      value: input.value,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  });
}

export async function updateFieldOption(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  optionId: string,
  userId: string,
  input: z.infer<typeof fieldOptionSchema>,
) {
  const field = await getAuthorizedOptionField(contractId, entityTypeId, fieldId, userId);

  if (!field?.options.some((option) => option.id === optionId)) {
    return null;
  }

  return prisma.fieldOption.update({
    where: { id: optionId },
    data: {
      label: input.label,
      value: input.value,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  });
}

export async function setFieldOptionActive(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  optionId: string,
  userId: string,
  isActive: boolean,
) {
  const field = await getAuthorizedOptionField(contractId, entityTypeId, fieldId, userId);

  if (!field?.options.some((option) => option.id === optionId)) {
    return null;
  }

  return prisma.fieldOption.update({
    where: { id: optionId },
    data: { isActive },
  });
}

export async function getFieldOptionUsage(
  optionId: string,
  client: PrismaClientLike = prisma,
) {
  const option = await client.fieldOption.findUnique({
    where: { id: optionId },
    include: {
      entityField: {
        select: {
          id: true,
          type: true,
        },
      },
    },
  });

  if (!option || !isOptionFieldType(option.entityField.type)) {
    return null;
  }

  const usageCount = await getFieldOptionUsageCount(
    client,
    option.entityField.id,
    option.entityField.type,
    option.value,
  );

  return {
    isUsed: usageCount > 0,
    usageCount,
  };
}

export async function deleteUnusedFieldOption(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  optionId: string,
  userId: string,
) {
  const field = await getAuthorizedOptionField(contractId, entityTypeId, fieldId, userId);

  if (!field?.options.some((option) => option.id === optionId)) {
    return null;
  }

  return prisma.$transaction(
    async (tx) => {
      const option = await tx.fieldOption.findFirst({
        where: {
          id: optionId,
          entityFieldId: field.id,
          entityField: {
            id: field.id,
            entityTypeId,
            entityType: {
              contractId,
            },
            type: {
              in: ["SELECT", "MULTISELECT"],
            },
          },
        },
        include: {
          entityField: {
            select: {
              id: true,
              type: true,
            },
          },
        },
      });

      if (!option || !isOptionFieldType(option.entityField.type)) {
        return null;
      }

      const usageCount = await getFieldOptionUsageCount(
        tx,
        option.entityField.id,
        option.entityField.type,
        option.value,
      );

      if (usageCount > 0) {
        throw userError(
          "No puedes eliminar esta opción porque está siendo utilizada por registros existentes. Puedes desactivarla para que deje de estar disponible en nuevos registros.",
        );
      }

      await tx.fieldOption.delete({
        where: { id: option.id },
      });

      return true;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function getFieldOptionUsageCount(
  client: PrismaClientLike,
  entityFieldId: string,
  type: "SELECT" | "MULTISELECT",
  value: string,
) {
  if (type === "SELECT") {
    return client.entityValue.count({
      where: {
        entityFieldId,
        textValue: value,
      },
    });
  }

  const rows = await client.$queryRaw<Array<{ count: bigint | number }>>(
    Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM "EntityValue"
      WHERE "entityFieldId" = ${entityFieldId}
        AND "jsonValue" @> CAST(${JSON.stringify([value])} AS jsonb)
    `,
  );
  const count = rows[0]?.count ?? 0;

  return typeof count === "bigint" ? Number(count) : count;
}

function isOptionFieldType(type: string): type is "SELECT" | "MULTISELECT" {
  return type === "SELECT" || type === "MULTISELECT";
}

function buildFieldConfig(
  input: z.infer<typeof entityFieldSchema>,
  existingConfig?: unknown,
  optionValues: string[] = [],
) {
  return buildMergedFieldConfig({
    existingConfig,
    type: input.type,
    relation:
      input.type === "RELATION"
        ? {
            targetEntityTypeId: input.targetEntityTypeId,
            relationKind: input.relationKind ?? "ONE",
          }
        : undefined,
    validation: input.validation,
    defaultValue: input.defaultValue,
    display: input.display,
    money: input.money,
    optionValues,
  });
}

function validatePrimaryInput(input: z.infer<typeof entityFieldSchema>) {
  if (input.display.primary && !input.isActive) {
    throw userError("Un campo inactivo no puede ser Campo principal.");
  }
}

async function unsetPrimaryFields(
  tx: Prisma.TransactionClient,
  fields: Array<{
    id: string;
    type: z.infer<typeof entityFieldSchema>["type"];
    config: Prisma.JsonValue | null;
  }>,
) {
  for (const field of fields) {
    const config = parseFieldConfig(field.config);

    if (!config.display.primary) {
      continue;
    }

    await tx.entityField.update({
      where: { id: field.id },
      data: {
        config: buildMergedFieldDisplayConfig({
          existingConfig: field.config,
          type: field.type,
          display: {
            ...config.display,
            primary: false,
          },
        }),
      },
    });
  }
}

type DisplayNameField = Parameters<typeof getRecordDisplayName>[0][number] & {
  createdAt?: Date | string | null;
  isActive: boolean;
};

function normalizeDisplayNameField(field: Partial<DisplayNameField> & {
  config: Prisma.JsonValue | null;
  id: string;
  type: z.infer<typeof entityFieldSchema>["type"];
}): DisplayNameField {
  return {
    createdAt: field.createdAt ?? new Date(0),
    id: field.id,
    config: field.config,
    isActive: field.isActive ?? true,
    key: field.key ?? field.id,
    name: field.name ?? field.id,
    options: field.options ?? [],
    required: field.required ?? false,
    searchable: field.searchable ?? false,
    sortOrder: field.sortOrder ?? 0,
    type: field.type,
  };
}

function setDisplayNameFieldPrimary(field: DisplayNameField, primary: boolean): DisplayNameField {
  const config = parseFieldConfig(field.config);

  if (config.display.primary === primary) {
    return field;
  }

  return {
    ...field,
    config: normalizeJsonConfig(
      buildMergedFieldDisplayConfig({
        existingConfig: field.config,
        type: field.type,
        display: {
          ...config.display,
          primary,
        },
      }),
    ),
  };
}

function normalizeJsonConfig(config: Prisma.InputJsonValue | typeof Prisma.JsonNull) {
  return config === Prisma.JsonNull ? null : config as Prisma.JsonValue;
}

function withPrimaryDisplayNameField(
  fields: Array<Partial<DisplayNameField> & {
    config: Prisma.JsonValue | null;
    id: string;
    type: z.infer<typeof entityFieldSchema>["type"];
  }>,
  primaryField: Partial<DisplayNameField> & {
    config: Prisma.JsonValue | null;
    id: string;
    type: z.infer<typeof entityFieldSchema>["type"];
  },
) {
  const primary = setDisplayNameFieldPrimary(normalizeDisplayNameField(primaryField), true);

  return [
    ...fields
      .filter((field) => field.id !== primary.id)
      .map((field) => setDisplayNameFieldPrimary(normalizeDisplayNameField(field), false)),
    primary,
  ];
}

function replaceDisplayNameField(
  fields: Array<Partial<DisplayNameField> & {
    config: Prisma.JsonValue | null;
    id: string;
    type: z.infer<typeof entityFieldSchema>["type"];
  }>,
  field: Partial<DisplayNameField> & {
    config: Prisma.JsonValue | null;
    id: string;
    type: z.infer<typeof entityFieldSchema>["type"];
  },
  primary: boolean,
) {
  const updated = setDisplayNameFieldPrimary(normalizeDisplayNameField(field), primary);

  return fields.map((item) => {
    if (item.id === updated.id) {
      return updated;
    }

    const normalized = normalizeDisplayNameField(item);

    return primary ? setDisplayNameFieldPrimary(normalized, false) : normalized;
  });
}

async function recalculateEntityTypeDisplayNames(
  tx: Prisma.TransactionClient,
  entityTypeId: string,
  fields: DisplayNameField[],
) {
  const activeFields = orderEntityFields(fields.filter((field) => field.isActive));
  const fieldIds = activeFields.map((field) => field.id);
  let cursor: string | undefined;

  do {
    const records = await tx.entityRecord.findMany({
      orderBy: { id: "asc" },
      take: displayNameRecalculationBatchSize,
      select: {
        id: true,
        displayName: true,
        values: {
          where: { entityFieldId: { in: fieldIds } },
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
      },
      where: {
        entityTypeId,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
    });

    const changedRecords = records
      .map((record) => ({
        id: record.id,
        displayName: getRecordDisplayName(
          activeFields,
          record.values.map((value): SerializedFieldValue => ({
            booleanValue: value.booleanValue,
            dateValue: value.dateValue,
            decimalValue: value.decimalValue,
            fieldId: value.entityFieldId,
            integerValue: value.integerValue,
            jsonValue: value.jsonValue ?? Prisma.JsonNull,
            textValue: value.textValue,
          })),
        ),
        previousDisplayName: record.displayName,
      }))
      .filter((record) => record.displayName !== record.previousDisplayName);

    await updateRecordDisplayNames(tx, changedRecords);
    cursor = records.at(-1)?.id;

    if (records.length < displayNameRecalculationBatchSize) {
      break;
    }
  } while (cursor);
}

async function updateRecordDisplayNames(
  tx: Prisma.TransactionClient,
  records: Array<{ id: string; displayName: string }>,
) {
  if (records.length === 0) {
    return;
  }

  const cases = records.map(
    (record) => Prisma.sql`WHEN "id" = ${record.id} THEN ${record.displayName}`,
  );

  await tx.$executeRaw(
    Prisma.sql`
      UPDATE "EntityRecord"
      SET "displayName" = CASE ${Prisma.join(cases, " ")} ELSE "displayName" END
      WHERE "id" IN (${Prisma.join(records.map((record) => record.id))})
    `,
  );
}

async function getAuthorizedOptionField(
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  userId: string,
) {
  const authorized = await getAuthorizedEntityType(contractId, entityTypeId, userId);

  if (!authorized) {
    return null;
  }

  const field = authorized.entityType.fields.find((item) => item.id === fieldId);

  if (!field || !optionFieldTypes.has(field.type)) {
    return null;
  }

  return field;
}

async function validateRelationTarget(
  contractId: string,
  input: z.infer<typeof entityFieldSchema>,
) {
  if (input.type !== "RELATION") {
    return;
  }

  const targetCount = await prisma.entityType.count({
    where: {
      id: input.targetEntityTypeId,
      contractId,
    },
  });

  if (targetCount === 0) {
    const error = new Error(
      "La entidad relacionada no pertenece a este contrato.",
    );
    error.name = "UserFacingError";
    throw error;
  }
}

async function validateTypeChange(
  field: { id: string; type: z.infer<typeof entityFieldSchema>["type"] },
  nextType: z.infer<typeof entityFieldSchema>["type"],
) {
  if (field.type === nextType) {
    return;
  }

  const [valueCount, relationCount] = await Promise.all([
    prisma.entityValue.count({ where: { entityFieldId: field.id } }),
    prisma.entityRelation.count({ where: { sourceFieldId: field.id } }),
  ]);

  if (valueCount > 0 || relationCount > 0) {
    throw userError("No puedes cambiar el tipo porque este campo ya contiene información.");
  }
}

async function validateOptionValueChanges(
  field: {
    id: string;
    options: Array<{ id: string; value: string }>;
  },
  options: FieldOptionDraft[],
) {
  const existing = new Map(field.options.map((option) => [option.id, option]));
  const missingOption = options.find((option) => option.id && !existing.has(option.id));

  if (missingOption) {
    throw userError("Una opción no pertenece a este campo.");
  }

  const changedValue = options.some((option) => {
    if (!option.id) {
      return false;
    }

    return existing.get(option.id)?.value !== option.value;
  });

  if (!changedValue) {
    return;
  }

  const valueCount = await prisma.entityValue.count({
    where: { entityFieldId: field.id },
  });

  if (valueCount > 0) {
    throw userError(
      "No puedes cambiar el valor interno de opciones que ya tienen información registrada.",
    );
  }
}
