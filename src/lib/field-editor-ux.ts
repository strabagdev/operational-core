import { type EntityFieldType } from "@prisma/client";

import { getFieldBehaviorBadges, getFieldTypeLabel, type FieldListField } from "./field-list-ux";

export type FieldEditorSection =
  | "basic"
  | "behavior"
  | "display"
  | "validation"
  | "options"
  | "relation";

export function getFieldTypeDescription(type: EntityFieldType) {
  const descriptions: Record<EntityFieldType, string> = {
    TEXT: "Para nombres, códigos o textos breves.",
    TEXTAREA: "Para observaciones o descripciones extensas.",
    EMAIL: "Valida una dirección de correo.",
    PHONE: "Para teléfonos de contacto.",
    URL: "Para enlaces y sitios web.",
    INTEGER: "Para cantidades sin decimales.",
    DECIMAL: "Para números con decimales.",
    MONEY: "Para valores monetarios.",
    BOOLEAN: "Para respuestas de sí o no.",
    DATE: "Para fechas sin hora.",
    DATETIME: "Para fecha y hora.",
    SELECT: "Permite elegir una opción predefinida.",
    MULTISELECT: "Permite seleccionar varias opciones.",
    RELATION: "Conecta este registro con registros de otra entidad.",
    FILE: "Archivo con soporte limitado en esta etapa.",
    IMAGE: "Imagen con soporte limitado en esta etapa.",
  };

  return descriptions[type];
}

export function getFieldEditorSections(type: EntityFieldType): FieldEditorSection[] {
  const sections: FieldEditorSection[] = ["basic", "behavior", "display", "validation"];

  if (type === "SELECT" || type === "MULTISELECT") {
    sections.push("options");
  }

  if (type === "RELATION") {
    sections.push("relation");
  }

  return sections;
}

export function getFieldEditorSummary(field?: FieldListField) {
  if (!field) {
    return "Nuevo campo";
  }

  const badges = getFieldBehaviorBadges(field);
  const summary = [getFieldTypeLabel(field.type), ...badges.slice(0, 2)];

  return summary.join(" · ");
}

export function canSubmitOptionFieldOnCreate({
  optionCount,
  type,
}: {
  optionCount: number;
  type: EntityFieldType;
}) {
  if (type !== "SELECT" && type !== "MULTISELECT") {
    return true;
  }

  return optionCount > 0;
}
