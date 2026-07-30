import { describe, expect, it } from "vitest";

import { FieldEditorInputError, getEntityFieldEditorInput } from "./entity-config";

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

  it("accepts select options in a single editor payload", () => {
    const formData = baseFieldForm("SELECT");
    appendOption(formData, "row_1", "Activo", "activo");
    appendOption(formData, "row_2", "Inactivo", "inactivo");

    expect(getEntityFieldEditorInput(formData).options).toHaveLength(2);
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

  it("limits option payload size", () => {
    const formData = baseFieldForm("MULTISELECT");

    for (let index = 0; index < 101; index += 1) {
      appendOption(formData, `row_${index}`, `Opción ${index}`, `opcion_${index}`);
    }

    expect(() => getEntityFieldEditorInput(formData)).toThrow(FieldEditorInputError);
  });
});
