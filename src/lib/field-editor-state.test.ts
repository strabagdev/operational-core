import { describe, expect, it } from "vitest";

import {
  buildRelationSummary,
  getCreateFieldDefaults,
  normalizeFieldKey,
  shouldSuggestPrimaryDefault,
  validateOptionDrafts,
} from "./field-editor-state";

describe("field editor state helpers", () => {
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
