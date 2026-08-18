import { describe, expect, it } from "vitest";
import { EntityFieldType } from "@prisma/client";

import {
  buildRelationSummary,
  fieldTypeDescriptions,
  fieldTypeLabels,
  fieldValidationControls,
  getCreateFieldDefaults,
  normalizeFieldKey,
  shouldSuggestPrimaryDefault,
  supportedEntityFieldTypes,
  validateOptionDrafts,
} from "./field-editor-state";

describe("field editor state helpers", () => {
  it("keeps the supported field type list aligned with Prisma without duplicates", () => {
    expect(supportedEntityFieldTypes).toEqual(Object.values(EntityFieldType));
    expect(new Set(supportedEntityFieldTypes).size).toBe(supportedEntityFieldTypes.length);
    expect(supportedEntityFieldTypes).toHaveLength(17);
    expect(supportedEntityFieldTypes).not.toContain("JSON");
  });

  it("maps every supported field type to the friendly creation labels", () => {
    expect(Object.keys(fieldTypeLabels).sort()).toEqual([...supportedEntityFieldTypes].sort());
    expect(fieldTypeLabels).toMatchObject({
      TEXT: "Texto corto",
      TEXTAREA: "Texto largo",
      INTEGER: "Número entero",
      DECIMAL: "Número decimal",
      MONEY: "Monto",
      BOOLEAN: "Sí / No",
      DATE: "Fecha",
      DATETIME: "Fecha y hora",
      TIME: "Hora",
      SELECT: "Lista de opciones",
      MULTISELECT: "Selección múltiple",
      EMAIL: "Correo electrónico",
      PHONE: "Teléfono",
      URL: "Enlace",
      FILE: "Archivo",
      IMAGE: "Imagen",
      RELATION: "Relación con otra entidad",
    });
    expect(Object.values(fieldTypeLabels)).not.toContain("JSON");
  });

  it("describes every supported field type and flags limited file/image support", () => {
    expect(Object.keys(fieldTypeDescriptions).sort()).toEqual(
      [...supportedEntityFieldTypes].sort(),
    );
    expect(fieldTypeDescriptions.FILE).toContain("soporte limitado");
    expect(fieldTypeDescriptions.IMAGE).toContain("soporte limitado");
  });

  it("allows creation defaults to be recalculated for every selected type", () => {
    for (const type of supportedEntityFieldTypes) {
      expect(() =>
        getCreateFieldDefaults({
          fieldCount: 1,
          hasPrimary: false,
          type,
        }),
      ).not.toThrow();
    }

    expect(
      getCreateFieldDefaults({ fieldCount: 1, hasPrimary: false, type: "TEXT" }).multiple,
    ).toBe(false);
    expect(
      getCreateFieldDefaults({ fieldCount: 1, hasPrimary: false, type: "MULTISELECT" })
        .multiple,
    ).toBe(true);
    expect(
      getCreateFieldDefaults({ fieldCount: 1, hasPrimary: false, type: "RELATION" })
        .multiple,
    ).toBe(true);
  });

  it("declares compatible validation controls per field type", () => {
    expect(fieldValidationControls.SELECT).toEqual(["required"]);
    expect(fieldValidationControls.MULTISELECT).toEqual(["required"]);
    expect(fieldValidationControls.RELATION).toEqual(["required"]);
    expect(fieldValidationControls.INTEGER).toEqual(["required", "numberRange"]);
    expect(fieldValidationControls.TIME).toEqual(["required"]);
    expect(fieldValidationControls.TEXT).toEqual(["required", "textLength", "regex"]);
    expect(fieldValidationControls.FILE).toEqual(["required"]);
    expect(fieldValidationControls.IMAGE).toEqual(["required"]);
  });

  it("normalizes field keys predictably", () => {
    expect(normalizeFieldKey("Nombre completo")).toBe("nombre_completo");
    expect(normalizeFieldKey("Fecha de ingreso")).toBe("fecha_de_ingreso");
    expect(normalizeFieldKey("N.º de contrato")).toBe("numero_de_contrato");
    expect(normalizeFieldKey("2026")).toBe("campo_2026");
  });

  it("suggests primary defaults only for the first compatible field", () => {
    expect(
      shouldSuggestPrimaryDefault({
        fieldCount: 0,
        hasPrimary: false,
        type: "TEXT",
      }),
    ).toBe(true);
    expect(
      shouldSuggestPrimaryDefault({
        fieldCount: 0,
        hasPrimary: false,
        type: "RELATION",
      }),
    ).toBe(false);
    expect(
      shouldSuggestPrimaryDefault({
        fieldCount: 1,
        hasPrimary: false,
        type: "TEXT",
      }),
    ).toBe(false);
  });

  it("reflects primary defaults into search and list display", () => {
    expect(
      getCreateFieldDefaults({
        fieldCount: 0,
        hasPrimary: false,
        type: "TEXT",
      }),
    ).toMatchObject({
      displayPrimary: true,
      displayShowInList: true,
      searchable: true,
    });
  });

  it("validates option drafts", () => {
    expect(validateOptionDrafts([]).fieldErrors.options).toEqual([
      "Debes agregar al menos una opción.",
    ]);
    expect(
      validateOptionDrafts([
        { label: "Activo", value: "estado", sortOrder: 1, isActive: true },
        { label: "Inactivo", value: "estado", sortOrder: 2, isActive: true },
      ]).fieldErrors["options.1.value"],
    ).toEqual(["Este valor interno está duplicado."]);
    expect(
      validateOptionDrafts([
        { label: "Activo", value: "activo", sortOrder: 1, isActive: true },
        { label: " activo ", value: "activo_2", sortOrder: 2, isActive: true },
      ]).fieldErrors["options.1.label"],
    ).toEqual(["Esta etiqueta está duplicada."]);
    expect(
      validateOptionDrafts([
        { label: "123", value: "123", sortOrder: 1, isActive: true },
      ]).fieldErrors["options.0.value"],
    ).toEqual(["Usa minúsculas, números y guion bajo; empieza con letra."]);
  });

  it("builds relation summaries", () => {
    expect(
      buildRelationSummary({
        sourceName: "Personas",
        targetName: "Equipos",
        relationKind: "MANY",
      }),
    ).toBe(
      "Este campo conectará Personas con Equipos y permitirá varias relaciones por registro.",
    );
  });
});
