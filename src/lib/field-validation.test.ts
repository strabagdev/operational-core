import { Prisma, type EntityFieldType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  FieldValidationError,
  buildMergedFieldConfig,
  getPrimaryDisplayField,
  getRecordDisplayName,
  getRecordListFields,
  normalizeRawFieldValue,
  parseFieldConfig,
  parseFieldDisplayConfig,
  validateRecordValues,
  validateRelationInputs,
} from "./field-validation";

function field({
  config = null,
  id = "field_1",
  key = "code",
  options = [],
  required = false,
  type = "TEXT",
}: {
  config?: Prisma.JsonValue | null;
  id?: string;
  key?: string;
  options?: Array<{ value: string; isActive?: boolean }>;
  required?: boolean;
  type?: EntityFieldType;
} = {}) {
  return {
    id,
    key,
    name: key,
    type,
    required,
    config,
    options,
  };
}

function formData(entries: Array<[string, string]> = []) {
  const data = new FormData();

  for (const [key, value] of entries) {
    data.append(key, value);
  }

  return data;
}

function expectFieldError(fn: () => unknown, fieldId = "field_1") {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(FieldValidationError);
    expect((error as FieldValidationError).fieldErrors[fieldId]?.length).toBeGreaterThan(0);
    return;
  }

  throw new Error("Expected FieldValidationError");
}

describe("field validation", () => {
  it("validates required empty string and spaces", () => {
    const config = { validation: { required: true } };

    expectFieldError(() => validateRecordValues({
      fields: [field({ config })],
      formData: formData([["field_field_1", ""]]),
      mode: "edit",
    }));

    expectFieldError(() => validateRecordValues({
      fields: [field({ config })],
      formData: formData([["field_field_1", "   "]]),
      mode: "edit",
    }));
  });

  it("does not treat false or 0 as empty", () => {
    const required = { validation: { required: true } };

    expect(() => validateRecordValues({
      fields: [field({ config: required, type: "BOOLEAN" })],
      formData: formData([]),
      mode: "edit",
    })).not.toThrow();

    expect(() => validateRecordValues({
      fields: [field({ config: required, type: "INTEGER" })],
      formData: formData([["field_field_1", "0"]]),
      mode: "edit",
    })).not.toThrow();
  });

  it("validates minLength and maxLength", () => {
    expectFieldError(() => validateRecordValues({
      fields: [field({ config: { validation: { minLength: 3 } } })],
      formData: formData([["field_field_1", "ab"]]),
      mode: "edit",
    }));

    expectFieldError(() => validateRecordValues({
      fields: [field({ config: { validation: { maxLength: 3 } } })],
      formData: formData([["field_field_1", "abcd"]]),
      mode: "edit",
    }));
  });

  it("validates minimum and maximum", () => {
    expectFieldError(() => validateRecordValues({
      fields: [field({ config: { validation: { minimum: 0 } }, type: "INTEGER" })],
      formData: formData([["field_field_1", "-1"]]),
      mode: "edit",
    }));

    expectFieldError(() => validateRecordValues({
      fields: [field({ config: { validation: { maximum: 10 } }, type: "DECIMAL" })],
      formData: formData([["field_field_1", "10.5"]]),
      mode: "edit",
    }));
  });

  it("validates regex and rejects invalid regex configuration", () => {
    expect(() => buildMergedFieldConfig({
      type: "TEXT",
      validation: { regex: { pattern: "^[A-Z]+$" } },
    })).not.toThrow();

    expect(() => buildMergedFieldConfig({
      type: "TEXT",
      validation: { regex: { pattern: "[" } },
    })).toThrow("El patrón regex no es válido.");
  });

  it("applies defaultValue on create and not on edit", () => {
    const config = buildMergedFieldConfig({
      type: "TEXT",
      validation: {},
      defaultValue: "AUTO",
    }) as Prisma.JsonValue;

    const created = validateRecordValues({
      fields: [field({ config })],
      formData: formData([]),
      mode: "create",
    });
    const edited = validateRecordValues({
      fields: [field({ config })],
      formData: formData([]),
      mode: "edit",
    });

    expect(created[0]?.textValue).toBe("AUTO");
    expect(edited).toHaveLength(0);
  });

  it("rejects integer decimals and accepts decimal decimals", () => {
    expect(() => normalizeRawFieldValue(field({ type: "INTEGER" }), ["1.5"])).toThrow(FieldValidationError);
    expect(normalizeRawFieldValue(field({ type: "DECIMAL" }), ["1.5"]).decimalValue?.toString()).toBe("1.5");
  });

  it("rejects select option from another field and deduplicates multiselect", () => {
    expect(() => validateRecordValues({
      fields: [field({ options: [{ value: "a" }], type: "SELECT" })],
      formData: formData([["field_field_1", "b"]]),
      mode: "edit",
    })).toThrow(FieldValidationError);

    const values = validateRecordValues({
      fields: [field({ options: [{ value: "a" }, { value: "b" }], type: "MULTISELECT" })],
      formData: formData([
        ["field_field_1", "a"],
        ["field_field_1", "a"],
        ["field_field_1", "b"],
      ]),
      mode: "edit",
    });

    expect(values[0]?.jsonValue).toEqual(["a", "b"]);
  });

  it("validates relation required", () => {
    expectFieldError(() => validateRelationInputs({
      fields: [field({ config: { validation: { required: true } }, type: "RELATION" })],
      formData: formData([]),
    }));
  });

  it("rejects incompatible rules and invalid ranges", () => {
    expect(() => buildMergedFieldConfig({
      type: "BOOLEAN",
      validation: { minLength: 1 },
    })).toThrow("minLength no es compatible con BOOLEAN.");

    expect(() => buildMergedFieldConfig({
      type: "INTEGER",
      validation: { minimum: 10, maximum: 1 },
    })).toThrow("El valor mínimo no puede ser mayor que el máximo.");

    expect(() => buildMergedFieldConfig({
      type: "TEXT",
      validation: { minLength: 10, maxLength: 1 },
    })).toThrow("La longitud mínima no puede ser mayor que la máxima.");
  });

  it("parses stored config without destroying relation settings", () => {
    const config = parseFieldConfig({
      targetEntityTypeId: "entity",
      relationKind: "MANY",
      validation: { required: true },
    });

    expect(config.targetEntityTypeId).toBe("entity");
    expect(config.relationKind).toBe("MANY");
    expect(config.validation.required).toBe(true);
  });
});

describe("field display configuration", () => {
  it("parses display configuration", () => {
    expect(parseFieldDisplayConfig({
      display: { primary: true, showInList: true, listOrder: 2 },
    })).toEqual({ primary: true, showInList: true, listOrder: 2 });
  });

  it("accepts compatible primary fields and rejects incompatible primary fields", () => {
    expect(() => buildMergedFieldConfig({
      type: "TEXT",
      validation: {},
      display: { primary: true },
    })).not.toThrow();

    expect(() => buildMergedFieldConfig({
      type: "TEXTAREA",
      validation: {},
      display: { primary: true },
    })).toThrow("TEXTAREA no puede ser campo principal.");
  });

  it("preserves validation when merging display settings", () => {
    const config = buildMergedFieldConfig({
      existingConfig: { validation: { required: true }, custom: { keep: true } },
      type: "TEXT",
      validation: { required: true },
      display: { showInList: true },
    });

    expect(config).toMatchObject({
      validation: { required: true },
      display: { showInList: true },
      custom: { keep: true },
    });
  });

  it("uses primary field for displayName and select primary labels", () => {
    const fields = [
      recordField({ id: "name", config: { display: { primary: true } } }),
      recordField({
        id: "state",
        type: "SELECT",
        options: [{ id: "opt_1", label: "Activo laboral", value: "activo" }],
      }),
    ];

    expect(getRecordDisplayName(fields, [{ fieldId: "name", textValue: "Ana" }])).toBe("Ana");

    expect(getRecordDisplayName(
      [
        recordField({
          id: "state",
          type: "SELECT",
          config: { display: { primary: true } },
          options: [{ id: "opt_1", label: "Activo laboral", value: "activo" }],
        }),
      ],
      [{ fieldId: "state", textValue: "activo" }],
    )).toBe("Activo laboral");
  });

  it("falls back when no primary is configured", () => {
    expect(getRecordDisplayName(
      [recordField({ id: "name", required: true })],
      [{ fieldId: "name", textValue: "Fallback" }],
    )).toBe("Fallback");
  });

  it("excludes primary from visible list fields and keeps dynamic Estado visible", () => {
    const fields = [
      recordField({
        id: "name",
        name: "Nombre",
        config: { display: { primary: true, showInList: true, listOrder: 1 } },
      }),
      recordField({
        id: "state",
        name: "Estado",
        type: "SELECT",
        config: { display: { showInList: true, listOrder: 4 } },
      }),
      recordField({
        id: "rut",
        name: "RUT",
        config: { display: { showInList: true, listOrder: 2 } },
      }),
    ];

    expect(getPrimaryDisplayField(fields)?.id).toBe("name");
    expect(getRecordListFields(fields).map((item) => item.name)).toEqual(["RUT", "Estado"]);
  });

  it("falls back to searchable fields and orders by listOrder then sortOrder", () => {
    const fields = [
      recordField({ id: "name", config: { display: { primary: true } }, searchable: true }),
      recordField({ id: "rut", name: "RUT", searchable: true, sortOrder: 2 }),
      recordField({ id: "cargo", name: "Cargo", searchable: true, sortOrder: 1 }),
      recordField({ id: "hidden", name: "Hidden", searchable: false, sortOrder: 0 }),
    ];

    expect(getRecordListFields(fields).map((item) => item.name)).toEqual(["Cargo", "RUT"]);

    expect(getRecordListFields([
      recordField({
        id: "name",
        name: "Name",
        config: { display: { primary: true } },
      }),
      recordField({
        id: "later",
        name: "Later",
        sortOrder: 1,
        config: { display: { showInList: true, listOrder: 20 } },
      }),
      recordField({
        id: "first",
        name: "First",
        sortOrder: 99,
        config: { display: { showInList: true, listOrder: 10 } },
      }),
    ]).map((item) => item.name)).toEqual(["First", "Later"]);
  });
});

function recordField({
  config = null,
  id,
  name = id,
  options = [],
  required = false,
  searchable = false,
  sortOrder = 0,
  type = "TEXT",
}: {
  config?: Prisma.JsonValue | null;
  id: string;
  name?: string;
  options?: Array<{ id: string; label: string; value: string; isActive?: boolean }>;
  required?: boolean;
  searchable?: boolean;
  sortOrder?: number;
  type?: EntityFieldType;
}) {
  return {
    id,
    entityTypeId: "entity",
    name,
    key: id,
    description: null,
    type,
    required,
    isUnique: false,
    searchable,
    multiple: false,
    sortOrder,
    config,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    options: options.map((option, index) => ({
      sortOrder: index,
      isActive: true,
      ...option,
    })),
  };
}
