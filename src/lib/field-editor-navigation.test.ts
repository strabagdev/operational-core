import { describe, expect, it } from "vitest";

import { buildFieldEditorHref, getFieldEditorMode } from "./field-editor-navigation";
import {
  canSubmitOptionFieldOnCreate,
  getFieldEditorSections,
  getFieldEditorSummary,
  getFieldTypeDescription,
} from "./field-editor-ux";
import type { FieldListField } from "./field-list-ux";

function field(overrides: Partial<FieldListField> = {}): FieldListField {
  return {
    id: "field_1",
    key: "nombre",
    name: "Nombre",
    description: null,
    type: "TEXT",
    required: false,
    isUnique: false,
    searchable: false,
    multiple: false,
    sortOrder: 1,
    config: null,
    isActive: true,
    options: [],
    ...overrides,
  };
}

describe("field editor navigation", () => {
  it("prioritizes edit mode when create and edit params are present", () => {
    expect(getFieldEditorMode({ createField: "1", editField: "abc" })).toEqual({
      kind: "edit",
      fieldId: "abc",
    });
  });

  it("preserves filters when opening and closing the drawer", () => {
    const currentParams = {
      createField: "1",
      editField: undefined,
      fieldQ: "rut",
      fieldType: "TEXT",
      fieldState: "ACTIVE",
      fieldUse: "SEARCH",
      notice: "Campo creado",
      tab: "fields",
      error: "No",
    };

    expect(buildFieldEditorHref({
      basePath: "/settings/entities/entity",
      currentParams,
      mode: { kind: "edit", fieldId: "field_1" },
    })).toBe("/settings/entities/entity?fieldQ=rut&fieldType=TEXT&fieldState=ACTIVE&fieldUse=SEARCH&notice=Campo+creado&tab=fields&editField=field_1");

    expect(buildFieldEditorHref({
      basePath: "/settings/entities/entity",
      currentParams,
      mode: { kind: "closed" },
    })).toBe("/settings/entities/entity?fieldQ=rut&fieldType=TEXT&fieldState=ACTIVE&fieldUse=SEARCH&notice=Campo+creado&tab=fields");
  });
});

describe("field editor UX", () => {
  it("returns type descriptions and sections by type", () => {
    expect(getFieldTypeDescription("TEXT")).toContain("nombres");
    expect(getFieldEditorSections("TEXT")).toEqual([
      "basic",
      "behavior",
      "display",
      "validation",
    ]);
    expect(getFieldEditorSections("SELECT")).toContain("options");
    expect(getFieldEditorSections("RELATION")).toContain("relation");
  });

  it("builds an edit summary", () => {
    expect(getFieldEditorSummary(field({
      config: { display: { primary: true } },
      required: true,
    }))).toBe("Texto corto · Principal · Obligatorio");
  });

  it("requires options for option fields on create", () => {
    expect(canSubmitOptionFieldOnCreate({ type: "SELECT", optionCount: 0 })).toBe(false);
    expect(canSubmitOptionFieldOnCreate({ type: "SELECT", optionCount: 1 })).toBe(true);
    expect(canSubmitOptionFieldOnCreate({ type: "TEXT", optionCount: 0 })).toBe(true);
  });
});
