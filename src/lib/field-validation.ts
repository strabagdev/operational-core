import { Prisma, type EntityFieldType } from "@prisma/client";
import { z } from "zod";

import { dateOnlyToUtcDate } from "./date-only";
import { orderEntityFields } from "./entity-field-order";
import {
  DEFAULT_MONEY_CURRENCY,
  getMoneyConfig,
  parseMoneyCurrency,
  type MoneyConfig,
} from "./money";

export type FieldErrorMap = Record<string, string[]>;

export type FieldOptionLike = {
  label?: string;
  value: string;
  isActive?: boolean;
};

export type DynamicField = {
  id: string;
  key: string;
  name: string;
  type: EntityFieldType;
  required: boolean;
  config: Prisma.JsonValue | null;
  options: FieldOptionLike[];
};

export type DisplayField = Pick<
  DynamicField,
  "id" | "name" | "key" | "type" | "required" | "config" | "options"
> & {
  searchable: boolean;
  sortOrder: number;
};

export type SerializedFieldValue = {
  fieldId: string;
  textValue?: string | null;
  integerValue?: number | null;
  decimalValue?: Prisma.Decimal | null;
  booleanValue?: boolean | null;
  dateValue?: Date | null;
  jsonValue?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
};

export type RelationInput = {
  fieldId: string;
  targetRecordIds: string[];
};

export type RelationConfig = {
  targetEntityTypeId?: string;
  relationKind?: "ONE" | "MANY";
};

export type FieldValidationRules = {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  regex?: {
    pattern: string;
    message?: string;
  };
};

export type FieldDisplayConfig = {
  primary?: boolean;
  showInClient?: boolean;
  showInList?: boolean;
  listOrder?: number;
};

export type ParsedFieldConfig = RelationConfig & {
  validation: FieldValidationRules;
  defaultValue?: Prisma.JsonValue;
  display: FieldDisplayConfig;
  money: MoneyConfig;
};

export class FieldValidationError extends Error {
  fieldErrors: FieldErrorMap;

  constructor(fieldErrors: FieldErrorMap) {
    super("Field validation failed.");
    this.name = "FieldValidationError";
    this.fieldErrors = fieldErrors;
  }
}

const textValidationTypes = new Set<EntityFieldType>(["TEXT", "TEXTAREA"]);
const numericValidationTypes = new Set<EntityFieldType>(["INTEGER", "DECIMAL", "MONEY"]);
const int4Min = -2147483648;
const int4Max = 2147483647;
const defaultValueTypes = new Set<EntityFieldType>([
  "TEXT",
  "TEXTAREA",
  "INTEGER",
  "DECIMAL",
  "MONEY",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "TIME",
  "SELECT",
  "MULTISELECT",
  "EMAIL",
  "PHONE",
  "URL",
]);

export const primaryFieldTypes = new Set<EntityFieldType>([
  "TEXT",
  "EMAIL",
  "PHONE",
  "URL",
  "INTEGER",
  "SELECT",
]);

export const configurableValidationMatrix: Record<
  EntityFieldType,
  Array<keyof FieldValidationRules | "defaultValue">
> = {
  TEXT: ["required", "minLength", "maxLength", "regex", "defaultValue"],
  TEXTAREA: ["required", "minLength", "maxLength", "regex", "defaultValue"],
  INTEGER: ["required", "minimum", "maximum", "defaultValue"],
  DECIMAL: ["required", "minimum", "maximum", "defaultValue"],
  MONEY: ["required", "minimum", "maximum", "defaultValue"],
  BOOLEAN: ["required", "defaultValue"],
  DATE: ["required", "defaultValue"],
  DATETIME: ["required", "defaultValue"],
  TIME: ["required", "defaultValue"],
  SELECT: ["required", "defaultValue"],
  MULTISELECT: ["required", "defaultValue"],
  RELATION: ["required"],
  EMAIL: ["required", "minLength", "maxLength", "regex", "defaultValue"],
  PHONE: ["required", "minLength", "maxLength", "regex", "defaultValue"],
  URL: ["required", "minLength", "maxLength", "regex", "defaultValue"],
  FILE: ["required"],
  IMAGE: ["required"],
};

const fieldConfigSchema = z.object({
  targetEntityTypeId: z.string().optional(),
  relationKind: z.enum(["ONE", "MANY"]).optional(),
  validation: z
    .object({
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
    })
    .default({}),
  defaultValue: z.unknown().optional(),
  display: z
    .object({
      primary: z.boolean().optional(),
      showInClient: z.boolean().optional(),
      showInList: z.boolean().optional(),
      listOrder: z.number().int().min(0).optional(),
    })
    .default({}),
  money: z
    .object({
      currency: z.string().optional(),
    })
    .default({}),
});

export function parseFieldConfig(config: unknown): ParsedFieldConfig {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { validation: {}, display: {}, money: { currency: DEFAULT_MONEY_CURRENCY } };
  }

  const parsed = fieldConfigSchema.safeParse(config);

  if (!parsed.success) {
    return { validation: {}, display: {}, money: { currency: DEFAULT_MONEY_CURRENCY } };
  }

  return {
    targetEntityTypeId: parsed.data.targetEntityTypeId,
    relationKind: parsed.data.relationKind,
    validation: parsed.data.validation,
    defaultValue: toJsonValue(parsed.data.defaultValue),
    display: parsed.data.display,
    money: {
      currency: parseMoneyCurrency(parsed.data.money.currency),
    },
  };
}

export function parseFieldDisplayConfig(config: unknown): FieldDisplayConfig {
  return parseFieldConfig(config).display;
}

export function getPrimaryDisplayField<T extends DisplayField>(fields: T[]) {
  const orderedFields = orderEntityFields(fields);

  return (
    orderedFields.find((field) => parseFieldConfig(field.config).display.primary) ??
    orderedFields.find((field) => field.type === "TEXT" && field.required) ??
    orderedFields.find((field) => field.type === "TEXT")
  );
}

export function getRecordListFields<T extends DisplayField>(fields: T[]) {
  const orderedFields = orderEntityFields(fields);
  const configuredFields = orderedFields.filter((field) => {
    const display = parseFieldConfig(field.config).display;

    return display.showInList === true;
  });
  const fieldsToShow =
    configuredFields.length > 0
      ? configuredFields
      : orderedFields.filter((field) => field.searchable);

  return orderEntityFields(fieldsToShow);
}

export function getRecordDisplayName(fields: DisplayField[], values: SerializedFieldValue[]) {
  const configuredPrimary = getPrimaryDisplayField(fields);
  const configuredValue = configuredPrimary
    ? formatDisplayValue(
        configuredPrimary,
        values.find((value) => value.fieldId === configuredPrimary.id),
      )
    : "";

  if (configuredValue) {
    return configuredValue;
  }

  const primaryField =
    fields.find((field) => field.type === "TEXT" && field.required) ??
    fields.find((field) => field.type === "TEXT");

  if (!primaryField) {
    return "Registro sin nombre";
  }

  const primaryValue = values.find((value) => value.fieldId === primaryField.id);

  return primaryValue?.textValue?.trim() || "Registro sin nombre";
}

export function getRelationConfig(config: unknown): RelationConfig {
  const parsed = parseFieldConfig(config);
  const nestedRelation = getNestedRelationConfig(config);

  return {
    targetEntityTypeId: parsed.targetEntityTypeId ?? nestedRelation.targetEntityTypeId,
    relationKind: parsed.relationKind ?? nestedRelation.relationKind ?? "ONE",
  };
}

function getNestedRelationConfig(config: unknown): RelationConfig {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {};
  }

  const relation = (config as Record<string, unknown>).relation;

  if (!relation || typeof relation !== "object" || Array.isArray(relation)) {
    return {};
  }

  const raw = relation as Record<string, unknown>;
  const relationKind = raw.relationKind === "MANY" || raw.relationKind === "ONE"
    ? raw.relationKind
    : undefined;

  return {
    targetEntityTypeId: typeof raw.targetEntityTypeId === "string"
      ? raw.targetEntityTypeId
      : undefined,
    relationKind,
  };
}

export function buildMergedFieldConfig({
  existingConfig,
  type,
  relation,
  validation,
  defaultValue,
  display,
  money,
  optionValues = [],
}: {
  existingConfig?: unknown;
  type: EntityFieldType;
  relation?: RelationConfig;
  validation: FieldValidationRules;
  defaultValue?: unknown;
  display?: FieldDisplayConfig;
  money?: MoneyConfig;
  optionValues?: string[];
}) {
  const base =
    existingConfig && typeof existingConfig === "object" && !Array.isArray(existingConfig)
      ? { ...(existingConfig as Record<string, unknown>) }
      : {};

  const cleanValidation = validateFieldConfiguration({
    type,
    validation,
    defaultValue,
    optionValues,
  });

  const nextConfig: Record<string, unknown> = {
    ...base,
    validation: cleanValidation.validation,
  };

  if (relation?.targetEntityTypeId) {
    nextConfig.targetEntityTypeId = relation.targetEntityTypeId;
    nextConfig.relationKind = relation.relationKind ?? "ONE";
  } else {
    delete nextConfig.targetEntityTypeId;
    delete nextConfig.relationKind;
  }

  if (cleanValidation.defaultValue !== undefined) {
    nextConfig.defaultValue = cleanValidation.defaultValue;
  } else {
    delete nextConfig.defaultValue;
  }

  const cleanDisplay = validateFieldDisplayConfiguration({ type, display });
  if (Object.keys(cleanDisplay).length > 0) {
    nextConfig.display = cleanDisplay;
  } else {
    delete nextConfig.display;
  }

  if (type === "MONEY") {
    nextConfig.money = {
      ...getMoneyConfig(base),
      currency: money?.currency ?? getMoneyConfig(base).currency,
    };
  } else {
    delete nextConfig.money;
  }

  if (
    Object.keys(nextConfig).length === 1 &&
    Object.keys(cleanValidation.validation).length === 0
  ) {
    return Prisma.JsonNull;
  }

  return nextConfig as Prisma.InputJsonObject;
}

export function buildMergedFieldDisplayConfig({
  existingConfig,
  type,
  display,
}: {
  existingConfig?: unknown;
  type: EntityFieldType;
  display: FieldDisplayConfig;
}) {
  const base =
    existingConfig && typeof existingConfig === "object" && !Array.isArray(existingConfig)
      ? { ...(existingConfig as Record<string, unknown>) }
      : {};
  const cleanDisplay = validateFieldDisplayConfiguration({ type, display });

  if (Object.keys(cleanDisplay).length > 0) {
    base.display = cleanDisplay;
  } else {
    delete base.display;
  }

  if (Object.keys(base).length === 0) {
    return Prisma.JsonNull;
  }

  return base as Prisma.InputJsonObject;
}

export function validateFieldDisplayConfiguration({
  type,
  display,
}: {
  type: EntityFieldType;
  display?: FieldDisplayConfig;
}) {
  const clean: FieldDisplayConfig = {};

  if (!display) {
    return clean;
  }

  if (display.primary) {
    if (!primaryFieldTypes.has(type)) {
      throw userError(`${type} no puede ser campo principal.`);
    }
    clean.primary = true;
    clean.showInList = true;
  } else if (display.showInList) {
    clean.showInList = true;
  }

  if (display.showInClient) {
    clean.showInClient = true;
  }

  if (display.listOrder !== undefined) {
    clean.listOrder = display.listOrder;
  }

  return clean;
}

export function validateFieldConfiguration({
  type,
  validation,
  defaultValue,
  optionValues = [],
}: {
  type: EntityFieldType;
  validation: FieldValidationRules;
  defaultValue?: unknown;
  optionValues?: string[];
}) {
  const clean: FieldValidationRules = {};

  if (validation.required !== undefined) {
    clean.required = validation.required;
  }

  if (validation.minLength !== undefined) {
    ensureCompatible(type, "minLength");
    clean.minLength = validation.minLength;
  }

  if (validation.maxLength !== undefined) {
    ensureCompatible(type, "maxLength");
    clean.maxLength = validation.maxLength;
  }

  if (
    clean.minLength !== undefined &&
    clean.maxLength !== undefined &&
    clean.minLength > clean.maxLength
  ) {
    throw userError("La longitud mínima no puede ser mayor que la máxima.");
  }

  if (validation.minimum !== undefined) {
    ensureCompatible(type, "minimum");
    clean.minimum = validation.minimum;
  }

  if (validation.maximum !== undefined) {
    ensureCompatible(type, "maximum");
    clean.maximum = validation.maximum;
  }

  if (
    clean.minimum !== undefined &&
    clean.maximum !== undefined &&
    clean.minimum > clean.maximum
  ) {
    throw userError("El valor mínimo no puede ser mayor que el máximo.");
  }

  if (validation.regex?.pattern) {
    ensureCompatible(type, "regex");
    try {
      new RegExp(validation.regex.pattern);
    } catch {
      throw userError("El patrón regex no es válido.");
    }
    clean.regex = {
      pattern: validation.regex.pattern,
      message: validation.regex.message || undefined,
    };
  }

  const normalizedDefault = normalizeDefaultValue(type, defaultValue, optionValues);

  if (normalizedDefault !== undefined) {
    validateNormalizedValue({
      field: {
        id: "defaultValue",
        key: "defaultValue",
        name: "Valor predeterminado",
        type,
        required: Boolean(clean.required),
        config: null,
        options: optionValues.map((value) => ({ value, isActive: true })),
      },
      value: normalizedDefault,
      rules: clean,
      fieldErrors: {},
    });
  }

  return {
    validation: clean,
    defaultValue: serializedValueToConfigDefault(normalizedDefault),
  };
}

export function validateRecordValues({
  fields,
  formData,
  mode,
}: {
  fields: DynamicField[];
  formData: FormData;
  mode: "create" | "edit";
}) {
  const values: SerializedFieldValue[] = [];
  const fieldErrors: FieldErrorMap = {};

  for (const field of fields) {
    if (field.type === "RELATION" || field.type === "FILE" || field.type === "IMAGE") {
      continue;
    }

    const parsedConfig = parseFieldConfig(field.config);
    const value = normalizeFieldInput({
      field,
      formData,
      applyDefault: mode === "create",
    });

    validateNormalizedValue({
      field,
      value,
      rules: {
        ...parsedConfig.validation,
        required: parsedConfig.validation.required ?? field.required,
      },
      fieldErrors,
    });

    if (!isEmptySerializedValue(value)) {
      values.push(value);
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new FieldValidationError(fieldErrors);
  }

  return values;
}

export function validateRelationInputs({
  fields,
  formData,
}: {
  fields: DynamicField[];
  formData: FormData;
}) {
  const relations: RelationInput[] = [];
  const fieldErrors: FieldErrorMap = {};

  for (const field of fields) {
    if (field.type !== "RELATION") {
      continue;
    }

    const config = parseFieldConfig(field.config);
    const fieldKey = fieldInputName(field.id);
    const targetRecordIds = Array.from(
      new Set(
        formData
          .getAll(fieldKey)
          .map((value) => String(value).trim())
          .filter(Boolean),
      ),
    );
    const required = config.validation.required ?? field.required;

    if (required && targetRecordIds.length === 0) {
      addFieldError(fieldErrors, field, "Este campo es obligatorio.");
    }

    if (config.relationKind !== "MANY" && targetRecordIds.length > 1) {
      addFieldError(fieldErrors, field, "Este campo admite solo una relación.");
    }

    relations.push({ fieldId: field.id, targetRecordIds });
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new FieldValidationError(fieldErrors);
  }

  return relations;
}

export function normalizeFieldInput({
  field,
  formData,
  applyDefault,
}: {
  field: DynamicField;
  formData: FormData;
  applyDefault: boolean;
}): SerializedFieldValue {
  const fieldKey = fieldInputName(field.id);
  const rawValues = formData.getAll(fieldKey);
  const config = parseFieldConfig(field.config);

  if (applyDefault && shouldApplyDefault(field, rawValues, config.defaultValue)) {
    const defaultValue = normalizeDefaultValue(field.type, config.defaultValue, activeOptionValues(field));

    return defaultValue ? { ...defaultValue, fieldId: field.id } : {
      fieldId: field.id,
    };
  }

  return normalizeRawFieldValue(field, rawValues);
}

export function normalizeRawFieldValue(
  field: Pick<DynamicField, "id" | "name" | "type" | "options">,
  rawValues: FormDataEntryValue[],
): SerializedFieldValue {
  const rawValue = String(rawValues[0] ?? "").trim();

  switch (field.type) {
    case "TEXT":
    case "TEXTAREA":
    case "PHONE":
      return { fieldId: field.id, textValue: rawValue || null };
    case "EMAIL":
      if (!rawValue) return { fieldId: field.id, textValue: null };
      return { fieldId: field.id, textValue: z.string().email(`${field.name} debe ser un email válido.`).parse(rawValue) };
    case "URL":
      if (!rawValue) return { fieldId: field.id, textValue: null };
      return { fieldId: field.id, textValue: z.string().url(`${field.name} debe ser una URL válida.`).parse(rawValue) };
    case "INTEGER":
      if (!rawValue) return { fieldId: field.id, integerValue: null };
      if (!/^-?\d+$/.test(rawValue)) {
        throw new FieldValidationError({ [field.id]: ["Debe ser un número entero."] });
      }
      {
        const integerValue = Number.parseInt(rawValue, 10);

        if (integerValue < int4Min || integerValue > int4Max) {
          throw new FieldValidationError({
            [field.id]: [
              `Debe estar entre ${int4Min} y ${int4Max}.`,
            ],
          });
        }

        return { fieldId: field.id, integerValue };
      }
    case "DECIMAL":
    case "MONEY":
      if (!rawValue) return { fieldId: field.id, decimalValue: null };
      if (!/^-?\d+(\.\d+)?$/.test(rawValue)) {
        throw new FieldValidationError({ [field.id]: ["Debe ser un decimal válido."] });
      }
      return { fieldId: field.id, decimalValue: new Prisma.Decimal(rawValue) };
    case "BOOLEAN":
      if (rawValues.length === 0) return { fieldId: field.id, booleanValue: null };
      return {
        fieldId: field.id,
        booleanValue: rawValues.some((value) => {
          const normalized = String(value).trim().toLowerCase();

          return normalized === "on" || normalized === "true" || normalized === "1";
        }),
      };
    case "DATE": {
      if (!rawValue) return { fieldId: field.id, dateValue: null };
      const date = dateOnlyToUtcDate(rawValue);

      if (!date) {
        throw new FieldValidationError({ [field.id]: [`${field.name} debe ser una fecha válida.`] });
      }

      return { fieldId: field.id, dateValue: date };
    }
    case "DATETIME":
      if (!rawValue) return { fieldId: field.id, dateValue: null };
      return { fieldId: field.id, dateValue: parseDateValue(rawValue, field.name) };
    case "TIME":
      if (!rawValue) return { fieldId: field.id, textValue: null };
      return { fieldId: field.id, textValue: normalizeTimeValue(rawValue, field.id) };
    case "SELECT":
      if (!rawValue) return { fieldId: field.id, textValue: null };
      validateOptionValue(field, rawValue);
      return { fieldId: field.id, textValue: rawValue };
    case "MULTISELECT": {
      const values = Array.from(
        new Set(rawValues.map((item) => String(item).trim()).filter(Boolean)),
      );
      for (const value of values) {
        validateOptionValue(field, value);
      }
      return { fieldId: field.id, jsonValue: values };
    }
    default:
      return { fieldId: field.id, jsonValue: Prisma.JsonNull };
  }
}

export function isEmptySerializedValue(value: SerializedFieldValue) {
  return (
    (value.textValue === undefined || value.textValue === null || value.textValue.trim() === "") &&
    (value.integerValue === undefined || value.integerValue === null) &&
    (value.decimalValue === undefined || value.decimalValue === null) &&
    (value.booleanValue === undefined || value.booleanValue === null) &&
    (value.dateValue === undefined || value.dateValue === null) &&
    (value.jsonValue === undefined ||
      value.jsonValue === Prisma.JsonNull ||
      (Array.isArray(value.jsonValue) && value.jsonValue.length === 0))
  );
}

export function fieldInputName(fieldId: string) {
  return `field_${fieldId}`;
}

function validateNormalizedValue({
  field,
  value,
  rules,
  fieldErrors,
}: {
  field: DynamicField;
  value: SerializedFieldValue;
  rules: FieldValidationRules;
  fieldErrors: FieldErrorMap;
}) {
  if (rules.required && isEmptySerializedValue(value)) {
    addFieldError(fieldErrors, field, "Este campo es obligatorio.");
  }

  if (value.textValue) {
    if (rules.minLength !== undefined && value.textValue.length < rules.minLength) {
      addFieldError(
        fieldErrors,
        field,
        `Debe contener al menos ${rules.minLength} caracteres.`,
      );
    }

    if (rules.maxLength !== undefined && value.textValue.length > rules.maxLength) {
      addFieldError(
        fieldErrors,
        field,
        `No puede superar ${rules.maxLength} caracteres.`,
      );
    }

    if (rules.regex?.pattern) {
      try {
        const regex = new RegExp(rules.regex.pattern);
        if (!regex.test(value.textValue)) {
          addFieldError(
            fieldErrors,
            field,
            rules.regex.message || "No cumple el patrón configurado.",
          );
        }
      } catch {
        addFieldError(fieldErrors, field, "El patrón configurado no es válido.");
      }
    }
  }

  const numericValue =
    value.integerValue ??
    (value.decimalValue !== undefined && value.decimalValue !== null
      ? value.decimalValue.toNumber()
      : null);

  if (numericValue !== null) {
    if (rules.minimum !== undefined && numericValue < rules.minimum) {
      addFieldError(fieldErrors, field, `Debe ser mayor o igual a ${rules.minimum}.`);
    }

    if (rules.maximum !== undefined && numericValue > rules.maximum) {
      addFieldError(fieldErrors, field, `Debe ser menor o igual a ${rules.maximum}.`);
    }
  }
}

function normalizeDefaultValue(
  type: EntityFieldType,
  defaultValue: unknown,
  optionValues: string[],
): SerializedFieldValue | undefined {
  if (defaultValue === undefined || defaultValue === null || defaultValue === "") {
    return undefined;
  }

  ensureCompatible(type, "defaultValue");

  if (type === "MULTISELECT") {
    const values = Array.isArray(defaultValue)
      ? defaultValue.map((value) => String(value).trim()).filter(Boolean)
      : String(defaultValue)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
    const deduped = Array.from(new Set(values));

    for (const value of deduped) {
      if (!optionValues.includes(value)) {
        throw userError("El valor predeterminado contiene una opción inexistente.");
      }
    }

    return { fieldId: "defaultValue", jsonValue: deduped };
  }

  if (type === "BOOLEAN") {
    return {
      fieldId: "defaultValue",
      booleanValue: defaultValue === true || defaultValue === "true" || defaultValue === "on",
    };
  }

  return normalizeRawFieldValue(
    {
      id: "defaultValue",
      name: "Valor predeterminado",
      type,
      options: optionValues.map((value) => ({ value, isActive: true })),
    },
    [String(defaultValue)],
  );
}

function serializedValueToConfigDefault(value?: SerializedFieldValue) {
  if (!value) return undefined;
  if (value.textValue !== undefined && value.textValue !== null) return value.textValue;
  if (value.integerValue !== undefined && value.integerValue !== null) return value.integerValue;
  if (value.decimalValue !== undefined && value.decimalValue !== null) {
    return value.decimalValue.toString();
  }
  if (value.booleanValue !== undefined && value.booleanValue !== null) return value.booleanValue;
  if (value.dateValue !== undefined && value.dateValue !== null) {
    return value.dateValue.toISOString();
  }
  if (value.jsonValue !== undefined && value.jsonValue !== Prisma.JsonNull) return value.jsonValue;
  return undefined;
}

function shouldApplyDefault(
  field: DynamicField,
  rawValues: FormDataEntryValue[],
  defaultValue: Prisma.JsonValue | undefined,
) {
  if (defaultValue === undefined || !defaultValueTypes.has(field.type)) {
    return false;
  }

  if (field.type === "BOOLEAN") {
    return rawValues.length === 0;
  }

  if (field.type === "MULTISELECT") {
    return rawValues.map(String).filter(Boolean).length === 0;
  }

  return rawValues.length === 0 || String(rawValues[0] ?? "").trim() === "";
}

function ensureCompatible(
  type: EntityFieldType,
  rule: keyof FieldValidationRules | "defaultValue",
) {
  if (!configurableValidationMatrix[type].includes(rule)) {
    throw userError(`${rule} no es compatible con ${type}.`);
  }

  if ((rule === "minLength" || rule === "maxLength" || rule === "regex") && !textValidationTypes.has(type) && type !== "EMAIL" && type !== "PHONE" && type !== "URL") {
    throw userError(`${rule} no es compatible con ${type}.`);
  }

  if ((rule === "minimum" || rule === "maximum") && !numericValidationTypes.has(type)) {
    throw userError(`${rule} no es compatible con ${type}.`);
  }
}

function validateOptionValue(
  field: Pick<DynamicField, "id" | "name" | "options">,
  value: string,
) {
  if (!activeOptionValues(field).includes(value)) {
    throw new FieldValidationError({ [field.id]: ["La opción seleccionada no es válida."] });
  }
}

function activeOptionValues(field: Pick<DynamicField, "options">) {
  return field.options
    .filter((option) => option.isActive !== false)
    .map((option) => option.value);
}

function formatDisplayValue(field: DisplayField, value?: SerializedFieldValue) {
  if (!value || isEmptySerializedValue(value)) {
    return "";
  }

  if (field.type === "SELECT" && value.textValue) {
    return field.options.find((option) => option.value === value.textValue)?.label ?? value.textValue;
  }

  if (field.type === "INTEGER" && value.integerValue !== undefined && value.integerValue !== null) {
    return String(value.integerValue);
  }

  return value.textValue?.trim() ?? "";
}

function parseDateValue(value: string, fieldName: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new FieldValidationError({ defaultValue: [`${fieldName} debe ser una fecha válida.`] });
  }

  return date;
}

export function normalizeTimeValue(value: unknown, fieldId = "defaultValue") {
  if (typeof value !== "string") {
    throw new FieldValidationError({ [fieldId]: ["Debe ser una hora válida en formato HH:mm."] });
  }

  const rawValue = value.trim();
  const match = /^(\d{2}):(\d{2})$/.exec(rawValue);

  if (!match) {
    throw new FieldValidationError({ [fieldId]: ["Debe ser una hora válida en formato HH:mm."] });
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    throw new FieldValidationError({ [fieldId]: ["Debe ser una hora válida en formato HH:mm."] });
  }

  return `${match[1]}:${match[2]}`;
}

function toJsonValue(value: unknown) {
  if (
    value === undefined ||
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    Array.isArray(value)
  ) {
    return value as Prisma.JsonValue | undefined;
  }

  if (typeof value === "object") {
    return value as Prisma.JsonValue;
  }

  return undefined;
}

function addFieldError(fieldErrors: FieldErrorMap, field: Pick<DynamicField, "id">, message: string) {
  fieldErrors[field.id] = [...(fieldErrors[field.id] ?? []), message];
}

function userError(message: string) {
  const error = new Error(message);
  error.name = "UserFacingError";

  return error;
}
