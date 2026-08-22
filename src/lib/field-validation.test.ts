import { Prisma, type EntityFieldType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  FieldValidationError,
  buildMergedFieldConfig,
  getPrimaryDisplayField,
  getRecordDisplayName,
  getRelationConfig,
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
      formData: formData([["field_field_1", "false"]]),
      mode: "edit",
    })).not.toThrow();

    expect(() => validateRecordValues({
      fields: [field({ config: required, type: "INTEGER" })],
      formData: formData([["field_field_1", "0"]]),
      mode: "edit",
    })).not.toThrow();
  });

  it("keeps an absent optional boolean empty while preserving explicit false", () => {
    expect(validateRecordValues({
      fields: [field({ type: "BOOLEAN" })],
      formData: formData([]),
      mode: "create",
    })).toEqual([]);

    expect(validateRecordValues({
      fields: [field({ type: "BOOLEAN" })],
      formData: formData([["field_field_1", "false"]]),
      mode: "create",
    })[0]).toMatchObject({ fieldId: "field_1", booleanValue: false });
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

  it("rejects integers outside the PostgreSQL INT4 range before Prisma", () => {
    expect(normalizeRawFieldValue(field({ type: "INTEGER" }), ["2147483647"]).integerValue).toBe(2147483647);
    expect(normalizeRawFieldValue(field({ type: "INTEGER" }), ["-2147483648"]).integerValue).toBe(-2147483648);

    expectFieldError(
      () => normalizeRawFieldValue(field({ type: "INTEGER" }), ["5269808713"]),
    );
    expectFieldError(
      () => normalizeRawFieldValue(field({ type: "INTEGER" }), ["2147483648"]),
    );
  });

  it("stores MONEY as Decimal and accepts values larger than INT4", () => {
    expect(
      normalizeRawFieldValue(field({ type: "MONEY" }), ["5269808713"]).decimalValue?.toString(),
    ).toBe("5269808713");
    expect(
      normalizeRawFieldValue(field({ type: "MONEY" }), ["1234.56"]).decimalValue?.toString(),
    ).toBe("1234.56");
  });

  it("normalizes TIME values to canonical HH:mm and rejects invalid times", () => {
    expect(normalizeRawFieldValue(field({ type: "TIME" }), ["08:05"]).textValue).toBe("08:05");
    expect(normalizeRawFieldValue(field({ type: "TIME" }), [" 23:59 "]).textValue).toBe("23:59");
    expect(normalizeRawFieldValue(field({ type: "TIME" }), [""]).textValue).toBeNull();

    for (const invalid of ["8:30", "24:00", "12:60", "abc", "2026-08-18T10:00"]) {
      expectFieldError(() => normalizeRawFieldValue(field({ type: "TIME" }), [invalid]));
    }
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

  it("reads relation config from the API-style nested shape", () => {
    expect(getRelationConfig({
      relation: {
        targetEntityTypeId: "entity_target",
        relationKind: "MANY",
      },
    })).toEqual({
      targetEntityTypeId: "entity_target",
      relationKind: "MANY",
    });
  });

  it("parses MONEY config with CLP fallback", () => {
    expect(parseFieldConfig(null).money.currency).toBe("CLP");
    expect(parseFieldConfig({ money: { currency: "UF" } }).money.currency).toBe("UF");
    expect(
      parseFieldConfig({
        validation: { required: true },
        money: { currency: "BTC" },
      }),
    ).toMatchObject({
      validation: { required: true },
      money: { currency: "CLP" },
    });
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

  it("merges required without dropping other validation, display, or custom config", () => {
    const config = buildMergedFieldConfig({
      existingConfig: {
        validation: {
          required: false,
          minLength: 2,
          maxLength: 20,
          regex: { pattern: "^[A-Z]+$" },
        },
        display: { showInList: true },
        custom: { keep: true },
      },
      type: "TEXT",
      validation: {
        required: true,
        minLength: 2,
        maxLength: 20,
        regex: { pattern: "^[A-Z]+$" },
      },
      display: { showInList: true },
    });

    expect(config).toMatchObject({
      validation: {
        required: true,
        minLength: 2,
        maxLength: 20,
        regex: { pattern: "^[A-Z]+$" },
      },
      display: { showInList: true },
      custom: { keep: true },
    });
  });

  it("merges MONEY currency without dropping validation, display, or unknown config", () => {
    const config = buildMergedFieldConfig({
      existingConfig: {
        validation: { required: true },
        display: { showInList: true },
        custom: { keep: true },
      },
      type: "MONEY",
      validation: { required: true, minimum: 0 },
      display: { showInList: true },
      money: { currency: "USD" },
    });

    expect(config).toMatchObject({
      validation: { required: true, minimum: 0 },
      display: { showInList: true },
      money: { currency: "USD" },
      custom: { keep: true },
    });
  });

  it("changing MONEY currency does not convert stored values", () => {
    const value = normalizeRawFieldValue(field({ type: "MONEY" }), ["5269808713"]);
    const config = buildMergedFieldConfig({
      existingConfig: { money: { currency: "CLP" } },
      type: "MONEY",
      validation: {},
      money: { currency: "USD" },
    });

    expect(value.decimalValue?.toString()).toBe("5269808713");
    expect(config).toMatchObject({ money: { currency: "USD" } });
  });

  it("merges required without dropping relation metadata", () => {
    const config = buildMergedFieldConfig({
      existingConfig: {
        targetEntityTypeId: "entity_target",
        relationKind: "MANY",
        validation: { required: false },
        custom: { keep: true },
      },
      type: "RELATION",
      relation: {
        targetEntityTypeId: "entity_target",
        relationKind: "MANY",
      },
      validation: { required: true },
    });

    expect(config).toMatchObject({
      targetEntityTypeId: "entity_target",
      relationKind: "MANY",
      validation: { required: true },
      custom: { keep: true },
    });
  });

  it("persists required false explicitly when merging config", () => {
    const config = buildMergedFieldConfig({
      existingConfig: {
        validation: { required: true, minLength: 2 },
        display: { showInList: true },
      },
      type: "TEXT",
      validation: { required: false, minLength: 2 },
      display: { showInList: true },
    });

    expect(config).toMatchObject({
      validation: { required: false, minLength: 2 },
      display: { showInList: true },
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

  it("keeps configured primary as a real visible list field and preserves official sortOrder", () => {
    const fields = [
      recordField({
        id: "name",
        name: "Nombre",
        sortOrder: 1,
        config: { display: { primary: true, showInList: true, listOrder: 1 } },
      }),
      recordField({
        id: "state",
        name: "Estado",
        type: "SELECT",
        sortOrder: 4,
        config: { display: { showInList: true, listOrder: 4 } },
      }),
      recordField({
        id: "rut",
        name: "RUT",
        sortOrder: 2,
        config: { display: { showInList: true, listOrder: 2 } },
      }),
    ];

    expect(getPrimaryDisplayField(fields)?.id).toBe("name");
    expect(getRecordListFields(fields).map((item) => item.name)).toEqual(["Nombre", "RUT", "Estado"]);
  });

  it("falls back to searchable fields and ignores listOrder for ordering", () => {
    const fields = [
      recordField({ id: "name", config: { display: { primary: true } }, searchable: true }),
      recordField({ id: "rut", name: "RUT", searchable: true, sortOrder: 2 }),
      recordField({ id: "cargo", name: "Cargo", searchable: true, sortOrder: 1 }),
      recordField({ id: "hidden", name: "Hidden", searchable: false, sortOrder: 0 }),
    ];

    expect(getRecordListFields(fields).map((item) => item.name)).toEqual(["name", "Cargo", "RUT"]);

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
    ]).map((item) => item.name)).toEqual(["Later", "First"]);
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
