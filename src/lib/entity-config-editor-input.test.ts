import { describe, expect, it } from "vitest";

import {
  FieldEditorInputError,
  getEntityFieldEditorInput,
  parseFormBoolean,
} from "./entity-config";
import {
  FIELD_OPTIONS_PAYLOAD_NAME,
  MAX_FIELD_OPTIONS,
  MAX_FIELD_OPTIONS_MESSAGE,
  serializeFieldOptionsPayload,
  supportedEntityFieldTypes,
} from "./field-editor-state";

function baseFieldForm(type = "TEXT") {
  const formData = new FormData();

  formData.set("name", "Campo de prueba");
  formData.set("key", "campo_de_prueba");
  formData.set("type", type);
  formData.set("isActive", "on");

  return formData;
}

function appendOption(formData: FormData, rowKey: string, label: string, value: string) {
  formData.append("optionRowKey", rowKey);
  formData.set(`optionLabel:${rowKey}`, label);
  formData.set(`optionValue:${rowKey}`, value);
  formData.set(`optionSortOrder:${rowKey}`, "1");
  formData.set(`optionActive:${rowKey}`, "on");
}

describe("entity field editor input", () => {
  it("parses form booleans explicitly", () => {
    const formData = new FormData();

    expect(parseFormBoolean(formData, "missing")).toBe(false);

    formData.set("required", "on");
    expect(parseFormBoolean(formData, "required")).toBe(true);

    formData.set("required", "true");
    expect(parseFormBoolean(formData, "required")).toBe(true);

    formData.set("required", "false");
    expect(parseFormBoolean(formData, "required")).toBe(false);

    formData.append("required", "true");
    expect(parseFormBoolean(formData, "required")).toBe(true);
  });

  it("uses the visible required switch as validation.required", () => {
    const formData = baseFieldForm("TEXT");

    formData.append("required", "false");
    formData.append("required", "true");

    expect(getEntityFieldEditorInput(formData).field).toMatchObject({
      required: true,
      validation: { required: true },
    });
  });

  it("persists required false from an explicit unchecked switch", () => {
    const formData = baseFieldForm("TEXT");

    formData.set("required", "false");

    expect(getEntityFieldEditorInput(formData).field).toMatchObject({
      required: false,
      validation: { required: false },
    });
  });

  it("does not let other switches overwrite required", () => {
    const formData = baseFieldForm("TEXT");

    formData.append("required", "false");
    formData.append("required", "true");
    formData.append("isUnique", "false");
    formData.append("isUnique", "true");
    formData.append("searchable", "false");
    formData.append("searchable", "true");
    formData.append("displayShowInList", "false");
    formData.append("displayShowInList", "true");

    expect(getEntityFieldEditorInput(formData).field).toMatchObject({
      required: true,
      isUnique: true,
      searchable: true,
      validation: { required: true },
      display: { showInList: true },
    });
  });

  it("accepts every supported Prisma field type in editor payloads", () => {
    for (const type of supportedEntityFieldTypes) {
      const formData = baseFieldForm(type);

      if (type === "SELECT" || type === "MULTISELECT") {
        appendOption(formData, "row_1", "Activo", "activo");
      }

      if (type === "RELATION") {
        formData.set("targetEntityTypeId", "entity_target");
      }

      expect(getEntityFieldEditorInput(formData).field.type).toBe(type);
    }
  });

  it("rejects non-existent field types", () => {
    expect(() => getEntityFieldEditorInput(baseFieldForm("JSON"))).toThrow();
  });

  it("parses simple fields without options", () => {
    const input = getEntityFieldEditorInput(baseFieldForm("TEXT"));

    expect(input.field.type).toBe("TEXT");
    expect(input.options).toEqual([]);
  });

  it("requires valid options for select fields", () => {
    expect(() => getEntityFieldEditorInput(baseFieldForm("SELECT"))).toThrow(
      FieldEditorInputError,
    );

    const formData = baseFieldForm("SELECT");
    appendOption(formData, "row_1", "Activo", "estado");
    appendOption(formData, "row_2", "Inactivo", "estado");

    try {
      getEntityFieldEditorInput(formData);
      throw new Error("Expected duplicated option error.");
    } catch (error) {
      expect(error).toBeInstanceOf(FieldEditorInputError);
      expect((error as FieldEditorInputError).fieldErrors["options.1.value"]).toEqual([
        "Este valor interno está duplicado.",
      ]);
    }
  });

  it("rejects duplicated option labels in editor payloads", () => {
    const formData = baseFieldForm("SELECT");
    appendOption(formData, "row_1", "Activo", "activo");
    appendOption(formData, "row_2", " activo ", "activo_2");

    try {
      getEntityFieldEditorInput(formData);
      throw new Error("Expected duplicated option label error.");
    } catch (error) {
      expect(error).toBeInstanceOf(FieldEditorInputError);
      expect((error as FieldEditorInputError).fieldErrors["options.1.label"]).toEqual([
        "Esta etiqueta está duplicada.",
      ]);
    }
  });

  it("accepts select options in a single editor payload", () => {
    const formData = baseFieldForm("SELECT");
    appendOption(formData, "row_1", "Activo", "activo");
    appendOption(formData, "row_2", "Inactivo", "inactivo");

    expect(getEntityFieldEditorInput(formData).options).toHaveLength(2);
  });

  it("parses the structured option payload sent by the client", () => {
    const formData = baseFieldForm("SELECT");

    formData.set(
      FIELD_OPTIONS_PAYLOAD_NAME,
      serializeFieldOptionsPayload([
        {
          label: "Activo",
          value: "activo",
          sortOrder: 1,
          isActive: true,
        },
        {
          id: "opt_inactivo",
          label: "Inactivo",
          value: "inactivo",
          sortOrder: 2,
          isActive: false,
        },
      ]),
    );

    expect(getEntityFieldEditorInput(formData).options).toEqual([
      {
        id: undefined,
        label: "Activo",
        value: "activo",
        sortOrder: 1,
        isActive: true,
      },
      {
        id: "opt_inactivo",
        label: "Inactivo",
        value: "inactivo",
        sortOrder: 2,
        isActive: false,
      },
    ]);
  });

  it("validates relation target on relation payloads", () => {
    expect(() => getEntityFieldEditorInput(baseFieldForm("RELATION"))).toThrow();

    const formData = baseFieldForm("RELATION");
    formData.set("targetEntityTypeId", "entity_target");
    formData.set("relationKind", "MANY");

    expect(getEntityFieldEditorInput(formData).field).toMatchObject({
      type: "RELATION",
      targetEntityTypeId: "entity_target",
      relationKind: "MANY",
    });
  });

  it("accepts 100 options in a single editor payload", () => {
    const formData = baseFieldForm("MULTISELECT");

    for (let index = 0; index < 100; index += 1) {
      appendOption(formData, `row_${index}`, `Opción ${index}`, `opcion_${index}`);
    }

    expect(getEntityFieldEditorInput(formData).options).toHaveLength(100);
  });

  it("accepts the centralized maximum option payload size", () => {
    const formData = baseFieldForm("MULTISELECT");

    for (let index = 0; index < MAX_FIELD_OPTIONS; index += 1) {
      appendOption(formData, `row_${index}`, `Opción ${index}`, `opcion_${index}`);
    }

    expect(getEntityFieldEditorInput(formData).options).toHaveLength(MAX_FIELD_OPTIONS);
  });

  it("rejects 501 options with the shared maximum message", () => {
    const formData = baseFieldForm("MULTISELECT");

    for (let index = 0; index < MAX_FIELD_OPTIONS + 1; index += 1) {
      appendOption(formData, `row_${index}`, `Opción ${index}`, `opcion_${index}`);
    }

    try {
      getEntityFieldEditorInput(formData);
      throw new Error("Expected option limit error.");
    } catch (error) {
      expect(error).toBeInstanceOf(FieldEditorInputError);
      expect((error as FieldEditorInputError).fieldErrors.options).toEqual([
        MAX_FIELD_OPTIONS_MESSAGE,
      ]);
    }
  });
});
