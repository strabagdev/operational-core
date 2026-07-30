import { describe, expect, it } from "vitest";

import {
  filterFieldList,
  getFieldBehaviorBadges,
  getFieldTypeLabel,
  getFieldUseBadges,
  type FieldListField,
} from "./field-list-ux";

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

describe("field list UX helpers", () => {
  it("maps internal field types to friendly labels", () => {
    expect(getFieldTypeLabel("TEXT")).toBe("Texto corto");
    expect(getFieldTypeLabel("EMAIL")).toBe("Correo electrónico");
    expect(getFieldTypeLabel("RELATION")).toBe("Relación con otra entidad");
    expect(getFieldTypeLabel("FILE")).toBe("Archivo");
  });

  it("builds behavior badges for required, primary, unique, default, regex, and multiple", () => {
    expect(getFieldBehaviorBadges(field({
      required: true,
      isUnique: true,
      multiple: true,
      config: {
        display: { primary: true },
        validation: { regex: { pattern: "^[A-Z]+$" } },
        defaultValue: "ABC",
      },
    }))).toEqual([
      "Principal",
      "Obligatorio",
      "No permite repetidos",
      "Valor predeterminado",
      "Formato validado",
      "Permite varios",
    ]);
  });

  it("builds use badges for list, search, select options, and relation kind", () => {
    expect(getFieldUseBadges(field({
      searchable: true,
      config: { display: { showInList: true } },
      options: [],
    }))).toEqual(["En listado", "En búsquedas"]);

    expect(getFieldUseBadges(field({
      type: "SELECT",
      options: [
        { id: "one", label: "Uno", value: "uno", sortOrder: 1, isActive: true },
        { id: "two", label: "Dos", value: "dos", sortOrder: 2, isActive: false },
      ],
    }))).toEqual(["1 opción"]);

    expect(getFieldUseBadges(field({
      type: "RELATION",
      config: { targetEntityTypeId: "equipos", relationKind: "MANY" },
    }), [{ id: "equipos", name: "Equipos" }])).toEqual(["Varias relaciones con Equipos"]);
  });

  it("filters by text, type, state, and usage", () => {
    const fields = [
      field({
        id: "name",
        key: "nombre",
        name: "Nombre",
        searchable: true,
        config: { display: { primary: true, showInList: true } },
      }),
      field({
        id: "rut",
        key: "rut",
        name: "RUT",
        description: "Identificador nacional",
        type: "TEXT",
        config: { validation: { regex: { pattern: "^\\d+$" } } },
      }),
      field({
        id: "relation",
        key: "equipo",
        name: "Equipo",
        type: "RELATION",
        isActive: false,
        config: { targetEntityTypeId: "equipos", relationKind: "ONE" },
      }),
    ];

    expect(filterFieldList({ fields, query: "nacional" }).map((item) => item.id)).toEqual(["rut"]);
    expect(filterFieldList({ fields, type: "RELATION" }).map((item) => item.id)).toEqual(["relation"]);
    expect(filterFieldList({ fields, state: "INACTIVE" }).map((item) => item.id)).toEqual(["relation"]);
    expect(filterFieldList({ fields, use: "PRIMARY" }).map((item) => item.id)).toEqual(["name"]);
    expect(filterFieldList({ fields, use: "LIST" }).map((item) => item.id)).toEqual(["name"]);
    expect(filterFieldList({ fields, use: "SEARCH" }).map((item) => item.id)).toEqual(["name"]);
    expect(filterFieldList({ fields, use: "VALIDATIONS" }).map((item) => item.id)).toEqual(["rut"]);
    expect(filterFieldList({ fields, use: "RELATION" }).map((item) => item.id)).toEqual(["relation"]);
  });
});
