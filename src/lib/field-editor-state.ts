import { type EntityFieldType } from "@prisma/client";

export const supportedEntityFieldTypes = [
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
] as const satisfies readonly EntityFieldType[];

export const fieldTypeLabels: Record<EntityFieldType, string> = {
  TEXT: "Texto corto",
  TEXTAREA: "Texto largo",
  INTEGER: "Número entero",
  DECIMAL: "Número decimal",
  MONEY: "Monto",
  BOOLEAN: "Sí / No",
  DATE: "Fecha",
  DATETIME: "Fecha y hora",
  SELECT: "Lista de opciones",
  MULTISELECT: "Selección múltiple",
  EMAIL: "Correo electrónico",
  PHONE: "Teléfono",
  URL: "Enlace",
  FILE: "Archivo",
  IMAGE: "Imagen",
  RELATION: "Relación con otra entidad",
};

export const fieldTypeDescriptions: Record<EntityFieldType, string> = {
  TEXT: "Para nombres, códigos o textos breves.",
  TEXTAREA: "Para observaciones o descripciones extensas.",
  INTEGER: "Para cantidades sin decimales.",
  DECIMAL: "Para números con decimales.",
  MONEY: "Para valores monetarios.",
  BOOLEAN: "Para respuestas de sí o no.",
  DATE: "Para fechas sin hora.",
  DATETIME: "Para fecha y hora.",
  SELECT: "Permite elegir una opción predefinida.",
  MULTISELECT: "Permite seleccionar varias opciones.",
  EMAIL: "Valida una dirección de correo.",
  PHONE: "Para teléfonos de contacto.",
  URL: "Para enlaces y sitios web.",
  FILE: "Archivo con soporte limitado en esta etapa.",
  IMAGE: "Imagen con soporte limitado en esta etapa.",
  RELATION: "Conecta este registro con registros de otra entidad.",
};

export type FieldValidationControl =
  | "required"
  | "textLength"
  | "numberRange"
  | "regex";

export const fieldValidationControls: Record<
  EntityFieldType,
  readonly FieldValidationControl[]
> = {
  TEXT: ["required", "textLength", "regex"],
  TEXTAREA: ["required", "textLength", "regex"],
  INTEGER: ["required", "numberRange"],
  DECIMAL: ["required", "numberRange"],
  MONEY: ["required", "numberRange"],
  BOOLEAN: ["required"],
  DATE: ["required"],
  DATETIME: ["required"],
  SELECT: ["required"],
  MULTISELECT: ["required"],
  EMAIL: ["required", "textLength", "regex"],
  PHONE: ["required", "textLength", "regex"],
  URL: ["required", "textLength", "regex"],
  FILE: ["required"],
  IMAGE: ["required"],
  RELATION: ["required"],
};

export type FieldEditorActionState = {
  success: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  values?: Record<string, string | string[] | boolean | undefined>;
};

export type FieldOptionDraft = {
  id?: string;
  label: string;
  value: string;
  sortOrder: number;
  isActive: boolean;
};

export const MAX_FIELD_OPTIONS = 500;
export const MAX_FIELD_OPTIONS_MESSAGE =
  "Puedes agregar un máximo de 500 opciones por vez.";
export const FIELD_OPTIONS_PAYLOAD_NAME = "fieldOptionsPayload";

export function serializeFieldOptionsPayload(options: FieldOptionDraft[]) {
  return JSON.stringify(
    options.map((option, index) => ({
      id: option.id ?? null,
      label: option.label,
      value: option.value,
      isActive: option.isActive,
      sortOrder: option.sortOrder || index + 1,
    })),
  );
}

export function parseFieldOptionsPayload(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = JSON.parse(value) as unknown;

  if (!Array.isArray(parsed)) {
    return null;
  }

  return parsed.map((option, index): FieldOptionDraft => {
    const row = option && typeof option === "object" ? option as Record<string, unknown> : {};

    return {
      id: optionalPayloadString(row.id),
      label: String(row.label ?? "").trim(),
      value: String(row.value ?? "").trim().toLowerCase(),
      sortOrder: payloadInteger(row.sortOrder) ?? index + 1,
      isActive: row.isActive !== false,
    };
  });
}

export const simpleFieldTypes = new Set<EntityFieldType>([
  "TEXT",
  "TEXTAREA",
  "EMAIL",
  "PHONE",
  "URL",
  "INTEGER",
  "DECIMAL",
  "MONEY",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "FILE",
  "IMAGE",
]);

export const optionFieldTypes = new Set<EntityFieldType>(["SELECT", "MULTISELECT"]);
export const relationFieldTypes = new Set<EntityFieldType>(["RELATION"]);
export const multipleFieldTypes = new Set<EntityFieldType>([
  "MULTISELECT",
  "FILE",
  "IMAGE",
  "RELATION",
]);

export const primaryCompatibleFieldTypes = new Set<EntityFieldType>([
  "TEXT",
  "EMAIL",
  "PHONE",
  "URL",
  "INTEGER",
  "SELECT",
]);

export function normalizeFieldKey(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\bn\s*(?:\.\s*[oº]|[°º])/g, "numero")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  return /^[a-z]/.test(normalized) ? normalized : normalized ? `campo_${normalized}` : "";
}

export function shouldSuggestPrimaryDefault({
  fieldCount,
  hasPrimary,
  type,
}: {
  fieldCount: number;
  hasPrimary: boolean;
  type: EntityFieldType;
}) {
  return fieldCount === 0 && !hasPrimary && primaryCompatibleFieldTypes.has(type);
}

export function getCreateFieldDefaults({
  fieldCount,
  hasPrimary,
  type,
}: {
  fieldCount: number;
  hasPrimary: boolean;
  type: EntityFieldType;
}) {
  const primary = shouldSuggestPrimaryDefault({ fieldCount, hasPrimary, type });

  return {
    isActive: true,
    required: false,
    isUnique: false,
    searchable: primary,
    multiple: type === "MULTISELECT" || type === "RELATION",
    displayPrimary: primary,
    displayShowInList: primary,
  };
}

export function buildRelationSummary({
  sourceName,
  targetName,
  relationKind,
}: {
  sourceName: string;
  targetName?: string;
  relationKind: "ONE" | "MANY";
}) {
  const target = targetName ?? "otra entidad";
  const amount = relationKind === "MANY" ? "varias relaciones" : "una relación";

  return `Este campo conectará ${sourceName} con ${target} y permitirá ${amount} por registro.`;
}

export function validateOptionDrafts(options: FieldOptionDraft[]) {
  const fieldErrors: Record<string, string[]> = {};
  const seenLabels = new Set<string>();
  const seenValues = new Set<string>();
  const keyRegex = /^[a-z][a-z0-9_]*$/;
  const validOptions = options.filter(
    (option) => option.label.trim() || option.value.trim(),
  );

  if (validOptions.length === 0) {
    fieldErrors.options = ["Debes agregar al menos una opción."];
  }

  for (const [index, option] of validOptions.entries()) {
    const labelKey = `options.${index}.label`;
    const valueKey = `options.${index}.value`;

    if (!option.label.trim()) {
      fieldErrors[labelKey] = ["La etiqueta es obligatoria."];
    } else if (seenLabels.has(option.label.trim().toLowerCase())) {
      fieldErrors[labelKey] = ["Esta etiqueta está duplicada."];
    }

    if (!option.value.trim()) {
      fieldErrors[valueKey] = ["El valor interno es obligatorio."];
      seenLabels.add(option.label.trim().toLowerCase());
      continue;
    }

    if (!keyRegex.test(option.value.trim())) {
      fieldErrors[valueKey] = [
        "Usa minúsculas, números y guion bajo; empieza con letra.",
      ];
      seenLabels.add(option.label.trim().toLowerCase());
      continue;
    }

    if (seenValues.has(option.value.trim())) {
      fieldErrors[valueKey] = ["Este valor interno está duplicado."];
    }

    seenLabels.add(option.label.trim().toLowerCase());
    seenValues.add(option.value.trim());
  }

  return {
    fieldErrors,
    validOptions,
    success: Object.keys(fieldErrors).length === 0,
  };
}

export function isDirtyFromSnapshot(current: unknown, initial: unknown) {
  return JSON.stringify(current) !== JSON.stringify(initial);
}

function optionalPayloadString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function payloadInteger(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);

  return Number.isInteger(numberValue) ? numberValue : undefined;
}
