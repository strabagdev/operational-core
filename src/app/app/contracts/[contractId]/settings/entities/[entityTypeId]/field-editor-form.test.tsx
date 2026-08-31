import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  FIELD_OPTIONS_PAYLOAD_NAME,
  MAX_FIELD_OPTIONS,
  MAX_FIELD_OPTIONS_MESSAGE,
  serializeFieldOptionsPayload,
  supportedEntityFieldTypes,
} from "@/lib/field-editor-state";

import { FieldEditorControls, validateClientForm } from "./field-editor-form";

function renderControls(
  props: Partial<Parameters<typeof FieldEditorControls>[0]> = {},
) {
  return renderToStaticMarkup(
    <FieldEditorControls
      defaultValues={props.defaultValues}
      entityName="Personas"
      entityTypes={[
        { id: "personas", name: "Personas" },
        { id: "empresas", name: "Empresas" },
      ]}
      fieldCount={props.fieldCount ?? 0}
      fieldErrors={props.fieldErrors ?? {}}
      hasPrimary={props.hasPrimary ?? false}
      mode={props.mode ?? "create"}
      setFirstErrorRef={() => {}}
    />,
  );
}

function optionPayload(size: number) {
  const formData = new FormData();

  formData.set("type", "SELECT");

  for (let index = 0; index < size; index += 1) {
    const rowKey = `row_${index}`;

    formData.append("optionRowKey", rowKey);
    formData.set(`optionLabel:${rowKey}`, `Opción ${index}`);
    formData.set(`optionValue:${rowKey}`, `opcion_${index}`);
    formData.set(`optionSortOrder:${rowKey}`, String(index + 1));
    formData.set(`optionActive:${rowKey}`, "true");
  }

  return formData;
}

describe("field editor controls", () => {
  it("renders the field type selector on create", () => {
    const html = renderControls({ mode: "create" });

    expect(html).toContain("Tipo de campo");
    expect(html).toContain("data-field-type-select=\"true\"");
    expect(html.match(/<option /g)).toHaveLength(supportedEntityFieldTypes.length);
    expect(html).toContain("Texto corto");
    expect(html).not.toContain("JSON");
  });

  it("renders the field type selector on editable edit", () => {
    const html = renderControls({
      mode: "edit",
      defaultValues: {
        name: "Estado",
        key: "estado",
        type: "SELECT",
        options: [
          { label: "Activo", value: "activo", sortOrder: 1, isActive: true },
        ],
      },
    });

    expect(html).toContain("Tipo de campo");
    expect(html).toContain("Lista de opciones");
    expect(html).not.toContain("No puedes cambiar el tipo porque este campo ya contiene información.");
  });

  it("renders a disabled field type selector on locked edit", () => {
    const html = renderControls({
      mode: "edit",
      defaultValues: {
        name: "Empresa",
        key: "empresa",
        type: "RELATION",
        hasValues: true,
      },
    });

    expect(html).toContain("Tipo de campo");
    expect(html).toContain("disabled=\"\"");
    expect(html).toContain("Relación con otra entidad");
    expect(html).toContain("No puedes cambiar el tipo porque este campo ya contiene información.");
    expect(html).toContain("type=\"hidden\"");
    expect(html).toContain("value=\"RELATION\"");
  });

  it("renders type-specific sections from the initial type", () => {
    expect(
      renderControls({ defaultValues: { type: "SELECT" } }),
    ).toContain("Agregar opción");
    expect(
      renderControls({ defaultValues: { type: "RELATION" } }),
    ).toContain("Entidad relacionada");
    expect(
      renderControls({ defaultValues: { type: "MONEY" } }),
    ).toContain("Moneda / unidad");
  });

  it("shows MONEY currency controls only for MONEY fields", () => {
    expect(renderControls({ defaultValues: { type: "INTEGER" } })).not.toContain("Moneda / unidad");
    expect(renderControls({ defaultValues: { type: "DECIMAL" } })).not.toContain("Moneda / unidad");
    expect(renderControls({ defaultValues: { type: "MONEY", money: { currency: "UF" } } })).toContain("Unidad de Fomento (UF)");
  });

  it("warns that changing MONEY currency does not convert existing values", () => {
    const html = renderControls({
      mode: "edit",
      defaultValues: {
        name: "Monto",
        key: "monto",
        type: "MONEY",
        hasValues: true,
      },
    });

    expect(html).toContain("Cambiar la moneda no convierte los valores existentes");
  });

  it("reopens with required checked from saved values and has no duplicate advanced required control", () => {
    const html = renderControls({
      mode: "edit",
      defaultValues: {
        name: "RUT",
        key: "rut",
        type: "TEXT",
        required: true,
        validation: { required: true },
      },
    });

    expect(html).toContain('name="required"');
    expect(html).toContain('checked=""');
    expect(html).not.toContain("validationRequired");
    expect(html).not.toContain("Obligatorio en validación");
  });

  it("renders and reopens the Mostrar en Cliente presentation control", () => {
    const html = renderControls({
      mode: "edit",
      defaultValues: {
        name: "RUT",
        key: "rut",
        type: "TEXT",
        display: { showInClient: true },
      },
    });

    expect(html).toContain("Mostrar en Cliente");
    expect(html).toContain('name="displayShowInClient"');
    expect(html).toContain('type="checkbox" name="displayShowInClient" checked="" value="true"');
  });

  it("allows 100 option rows in client validation", () => {
    expect(validateClientForm(optionPayload(100))).toEqual({});
  });

  it("allows the shared maximum option rows in client validation", () => {
    expect(validateClientForm(optionPayload(MAX_FIELD_OPTIONS))).toEqual({});
  });

  it("rejects 501 option rows in client validation with the shared message", () => {
    expect(validateClientForm(optionPayload(MAX_FIELD_OPTIONS + 1))).toEqual({
      options: [MAX_FIELD_OPTIONS_MESSAGE],
    });
  });

  it("validates the structured option payload submitted by the client", () => {
    const formData = new FormData();

    formData.set("type", "SELECT");
    formData.set(
      FIELD_OPTIONS_PAYLOAD_NAME,
      serializeFieldOptionsPayload([
        { label: "Activo", value: "activo", sortOrder: 1, isActive: true },
        { label: "Inactivo", value: "inactivo", sortOrder: 2, isActive: true },
      ]),
    );

    expect(validateClientForm(formData)).toEqual({});
  });
});
