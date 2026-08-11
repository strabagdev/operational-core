import { type EntityFieldType } from "@prisma/client";

import { fieldTypeDescriptions } from "./field-editor-state";
import { getFieldBehaviorBadges, getFieldTypeLabel, type FieldListField } from "./field-list-ux";

export type FieldEditorSection =
  | "basic"
  | "behavior"
  | "display"
  | "validation"
  | "options"
  | "relation";

export function getFieldTypeDescription(type: EntityFieldType) {
  return fieldTypeDescriptions[type];
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
