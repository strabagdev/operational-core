import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getAuthorizedContract } from "./contracts";
import {
  buildMergedFieldConfig,
  buildMergedFieldDisplayConfig,
  parseFieldConfig,
  type FieldDisplayConfig,
  type FieldErrorMap,
  type FieldValidationRules,
} from "./field-validation";
import { validateOptionDrafts, type FieldOptionDraft } from "./field-editor-state";
import { keyify, slugify } from "./format";
import { prisma } from "./prisma";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const keyRegex = /^[a-z][a-z0-9_]*$/;
const relationKinds = ["ONE", "MANY"] as const;

const multipleFieldTypes = new Set(["MULTISELECT", "FILE", "IMAGE", "RELATION"]);
const optionFieldTypes = new Set(["SELECT", "MULTISELECT"]);

export const entityTypeSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "El slug debe tener al menos 2 caracteres.")
    .regex(slugRegex, "Usa solo minúsculas, números y guiones."),
  description: z.string().trim().optional(),
  icon: z.string().trim().optional(),
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
    type: z.enum([
      "TEXT",
      "TEXTAREA",
      "INTEGER",
      "DECIMAL",
      "MONEY",
      "BOOLEAN",
      "DATE",
      "DATETIME",
      "SELECT",
      "MULTISELECT",
      "EMAIL",
      "PHONE",
      "URL",
      "FILE",
      "IMAGE",
      "RELATION",
    ]),
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

export function formBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

export function getEntityTypeInput(formData: FormData) {
  return entityTypeSchema.parse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description") || undefined,
    icon: formData.get("icon") || undefined,
    isActive: formBoolean(formData, "isActive"),
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
    required: validation.required ?? formBoolean(formData, "required"),
    isUnique: formBoolean(formData, "isUnique"),
    searchable: formBoolean(formData, "searchable"),
    multiple: formBoolean(formData, "multiple"),
    isActive: formBoolean(formData, "isActive"),
    targetEntityTypeId: formData.get("targetEntityTypeId") || undefined,
    relationKind: formData.get("relationKind") || undefined,
    validation,
    defaultValue: getDefaultValueInput(formData, type),
    display,
  });
}

export function getFieldOptionInput(formData: FormData) {
  return fieldOptionSchema.parse({
    label: formData.get("label"),
    value: formData.get("value"),
    sortOrder: formData.get("sortOrder") || 0,
    isActive: formBoolean(formData, "isActive"),
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
  const rowKeys = formData
    .getAll("optionRowKey")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (rowKeys.length > 100) {
    throw new FieldEditorInputError("Revisa las opciones antes de guardar.", {
      options: ["Puedes guardar hasta 100 opciones por envío."],
    });
  }

  return rowKeys.map((rowKey, index) => ({
      id: optionalString(formData.get(`optionId:${rowKey}`)),
      label: String(formData.get(`optionLabel:${rowKey}`) ?? "").trim(),
      value: String(formData.get(`optionValue:${rowKey}`) ?? "").trim().toLowerCase(),
      sortOrder:
        optionalInteger(formData.get(`optionSortOrder:${rowKey}`)) ?? index + 1,
      isActive: formBoolean(formData, `optionActive:${rowKey}`),
    }));
}

function getFieldValidationInput(formData: FormData): FieldValidationRules {
  const regexPattern = optionalString(formData.get("validationRegexPattern"));
  const regexMessage = optionalString(formData.get("validationRegexMessage"));

  return {
    required: formBoolean(formData, "validationRequired"),
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
    primary: formBoolean(formData, "displayPrimary"),
    showInList:
      formBoolean(formData, "displayPrimary") || formBoolean(formData, "displayShowInList"),
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
  const contract = await getAuthorizedContract(contractId, userId);

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
  const contract = await getAuthorizedContract(contractId, userId);

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
            orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
          },
          _count: {
            select: {
              values: true,
              relations: true,
            },
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

export async function createEntityType(
  contractId: string,
  userId: string,
  input: z.infer<typeof entityTypeSchema>,
) {
  const contract = await getAuthorizedContract(contractId, userId);

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

    return tx.entityField.create({
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

  return prisma.$transaction(async (tx) => {
    if (input.display.primary) {
      await unsetPrimaryFields(
        tx,
        authorized.entityType.fields.filter((item) => item.id !== field.id),
      );
    }

    return tx.entityField.update({
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
      for (const [index, option] of options.entries()) {
        if (option.id) {
          await tx.fieldOption.update({
            where: { id: option.id },
            data: {
              label: option.label,
              value: option.value,
              sortOrder: option.sortOrder || index + 1,
              isActive: option.isActive,
            },
          });
        } else {
          await tx.fieldOption.create({
            data: {
              entityFieldId: field.id,
              label: option.label,
              value: option.value,
              sortOrder: option.sortOrder || index + 1,
              isActive: option.isActive,
            },
          });
        }
      }
    }

    return updated;
  });
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

  const fields = authorized.entityType.fields;
  const index = fields.findIndex((field) => field.id === fieldId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;

  if (index < 0 || swapIndex < 0 || swapIndex >= fields.length) {
    return null;
  }

  const current = fields[index];
  const target = fields[swapIndex];

  await prisma.$transaction([
    prisma.entityField.update({
      where: { id: current.id },
      data: { sortOrder: target.sortOrder },
    }),
    prisma.entityField.update({
      where: { id: target.id },
      data: { sortOrder: current.sortOrder },
    }),
  ]);

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
