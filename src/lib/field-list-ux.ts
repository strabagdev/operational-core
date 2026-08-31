import { type EntityFieldType, type Prisma } from "@prisma/client";

import { fieldTypeLabels } from "./field-editor-state";
import { parseFieldConfig } from "./field-validation";

export type FieldListOption = {
  id: string;
  label: string;
  value: string;
  sortOrder: number;
  isActive: boolean;
};

export type FieldListEntityType = {
  id: string;
  name: string;
};

export type FieldListField = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  type: EntityFieldType;
  required: boolean;
  isUnique: boolean;
  searchable: boolean;
  multiple: boolean;
  sortOrder: number;
  config: Prisma.JsonValue | null;
  isActive: boolean;
  options: FieldListOption[];
};

export type FieldUseFilter =
  | "ALL"
  | "PRIMARY"
  | "LIST"
  | "SEARCH"
  | "VALIDATIONS"
  | "RELATION"
  | "OPTIONS";

export function getFieldTypeLabel(type: EntityFieldType) {
  return fieldTypeLabels[type];
}

export function hasLimitedSupport(type: EntityFieldType) {
  return type === "FILE" || type === "IMAGE";
}

export function getFieldBehaviorBadges(field: FieldListField) {
  const config = parseFieldConfig(field.config);
  const badges: string[] = [];

  if (config.display.primary) badges.push("Principal");
  if (config.validation.required ?? field.required) badges.push("Obligatorio");
  if (field.isUnique) badges.push("No permite repetidos");
  if (config.defaultValue !== undefined) badges.push("Valor predeterminado");
  if (hasAdvancedValidation(field)) badges.push("Formato validado");
  if (field.multiple) badges.push("Permite varios");

  return badges;
}

export function getFieldUseBadges(
  field: FieldListField,
  entityTypes: FieldListEntityType[] = [],
) {
  const config = parseFieldConfig(field.config);
  const badges: string[] = [];

  if (config.display.showInList) badges.push("En listado");
  if (config.display.showInClient) badges.push("En Cliente");
  if (field.searchable) badges.push("En búsquedas");

  if (field.type === "RELATION") {
    const target = entityTypes.find((entityType) => entityType.id === config.targetEntityTypeId);
    badges.push(
      `${config.relationKind === "MANY" ? "Varias relaciones" : "Una relación"}${
        target ? ` con ${target.name}` : ""
      }`,
    );
  }

  if (field.type === "SELECT" || field.type === "MULTISELECT") {
    const activeOptions = field.options.filter((option) => option.isActive).length;
    badges.push(
      `${activeOptions} ${activeOptions === 1 ? "opción" : "opciones"}`,
    );
  }

  if (hasLimitedSupport(field.type)) badges.push("Soporte limitado");

  return badges;
}

export function fieldMatchesUseFilter(field: FieldListField, use: FieldUseFilter) {
  const config = parseFieldConfig(field.config);

  switch (use) {
    case "PRIMARY":
      return config.display.primary === true;
    case "LIST":
      return config.display.showInList === true;
    case "SEARCH":
      return field.searchable;
    case "VALIDATIONS":
      return Object.keys(config.validation).length > 0 || config.defaultValue !== undefined;
    case "RELATION":
      return field.type === "RELATION";
    case "OPTIONS":
      return field.type === "SELECT" || field.type === "MULTISELECT";
    case "ALL":
      return true;
  }
}

export function filterFieldList({
  fields,
  query,
  type,
  state,
  use,
}: {
  fields: FieldListField[];
  query?: string;
  type?: EntityFieldType | "ALL";
  state?: "ACTIVE" | "INACTIVE" | "ALL";
  use?: FieldUseFilter;
}) {
  const normalizedQuery = query?.trim().toLowerCase();

  return fields.filter((field) => {
    if (normalizedQuery) {
      const haystack = [field.name, field.key, field.description ?? ""]
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(normalizedQuery)) {
        return false;
      }
    }

    if (type && type !== "ALL" && field.type !== type) {
      return false;
    }

    if (state === "ACTIVE" && !field.isActive) {
      return false;
    }

    if (state === "INACTIVE" && field.isActive) {
      return false;
    }

    return fieldMatchesUseFilter(field, use ?? "ALL");
  });
}

function hasAdvancedValidation(field: FieldListField) {
  const validation = parseFieldConfig(field.config).validation;

  return Boolean(
    validation.minLength !== undefined ||
      validation.maxLength !== undefined ||
      validation.minimum !== undefined ||
      validation.maximum !== undefined ||
      validation.regex?.pattern,
  );
}
