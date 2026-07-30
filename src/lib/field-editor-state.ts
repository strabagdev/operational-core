import { type EntityFieldType } from "@prisma/client";

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
  const seen = new Set<string>();
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
    }

    if (!option.value.trim()) {
      fieldErrors[valueKey] = ["El valor interno es obligatorio."];
      continue;
    }

    if (!keyRegex.test(option.value.trim())) {
      fieldErrors[valueKey] = [
        "Usa minúsculas, números y guion bajo; empieza con letra.",
      ];
      continue;
    }

    if (seen.has(option.value.trim())) {
      fieldErrors[valueKey] = ["Este valor interno está duplicado."];
    }

    seen.add(option.value.trim());
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
