import ExcelJS from "exceljs";
import { Prisma, type EntityFieldType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  ENTITY_IMPORT_LIMITS,
  EntityImportUserError,
  RELATION_IMPORT_EXPORT_SEPARATOR,
  RECORD_ID_HEADER,
  assertEntityImportable,
  buildImportPersistencePlan,
  friendlyImportPersistenceError,
  generateEntityTemplate,
  getImportableFields,
  parseExcelRows,
  templateFileName,
  validateImportRows,
} from "./entity-import";
import { fieldInputName, validateRecordValues } from "./field-validation";

type ImportTestField = Parameters<typeof getImportableFields>[0][number];

function field(overrides: Record<string, unknown> = {}): ImportTestField {
  return {
    id: String(overrides.id ?? "field_1"),
    entityTypeId: "entity_1",
    name: String(overrides.name ?? "Nombre"),
    key: String(overrides.key ?? "nombre"),
    description: null,
    type: (overrides.type ?? "TEXT") as EntityFieldType,
    required: Boolean(overrides.required ?? false),
    isUnique: Boolean(overrides.isUnique ?? false),
    searchable: false,
    multiple: Boolean(overrides.multiple ?? false),
    sortOrder: Number(overrides.sortOrder ?? 1),
    config: overrides.config ?? null,
    isActive: Boolean(overrides.isActive ?? true),
    createdAt: new Date(),
    updatedAt: new Date(),
    options: (overrides.options ?? []) as ImportTestField["options"],
  };
}

async function workbookFile(headers: string[], rows: unknown[][] = [], name = "plantilla.xlsx") {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Plantilla");

  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(row);
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new File([buffer], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function toComparableValues(values: ReturnType<typeof validateRecordValues>) {
  return values.map((value) => ({
    fieldId: value.fieldId,
    textValue: value.textValue ?? null,
    integerValue: value.integerValue ?? null,
    decimalValue: value.decimalValue?.toString() ?? null,
    booleanValue: value.booleanValue ?? null,
    dateValue: value.dateValue?.toISOString() ?? null,
    jsonValue: value.jsonValue ?? null,
  }));
}

function existingRecord(
  id: string,
  values: Array<Partial<{
    entityFieldId: string;
    textValue: string | null;
    integerValue: number | null;
    decimalValue: Prisma.Decimal | null;
    booleanValue: boolean | null;
    dateValue: Date | null;
    jsonValue: Prisma.JsonValue | null;
  }>>,
) {
  return {
    id,
    displayName: id,
    values: values.map((value) => ({
      entityFieldId: String(value.entityFieldId),
      textValue: value.textValue ?? null,
      integerValue: value.integerValue ?? null,
      decimalValue: value.decimalValue ?? null,
      booleanValue: value.booleanValue ?? null,
      dateValue: value.dateValue ?? null,
      jsonValue: value.jsonValue ?? null,
    })),
  };
}

function relationField(overrides: Record<string, unknown> = {}) {
  return field({
    id: "department",
    name: "Departamento",
    type: "RELATION",
    required: false,
    config: {
      targetEntityTypeId: "departments",
      relationKind: overrides.multiple ? "MANY" : "ONE",
    },
    multiple: Boolean(overrides.multiple ?? false),
    ...overrides,
  });
}

function relationLookup(
  matchesByDisplayName: Record<string, Array<{ id: string; entityTypeId?: string }>>,
) {
  return async () =>
    new Map(
      Object.entries(matchesByDisplayName).map(([displayName, matches]) => [
        displayName,
        matches.map((match) => ({
          id: match.id,
          displayName,
          entityTypeId: match.entityTypeId ?? "departments",
        })),
      ]),
    );
}

describe("entity import template", () => {
  it("includes active supported fields including relations and excludes inactive/file/image fields without reordering remaining fields", () => {
    const fields = getImportableFields([
      field({ id: "name", name: "Nombre", type: "TEXT", sortOrder: 1 }),
      field({ id: "old", name: "Antiguo", type: "TEXT", isActive: false }),
      field({ id: "rel", name: "Empresa", type: "RELATION", sortOrder: 2 }),
      field({ id: "file", name: "Archivo", type: "FILE" }),
      field({ id: "image", name: "Imagen", type: "IMAGE" }),
      field({ id: "email", name: "Correo", type: "EMAIL", sortOrder: 3 }),
    ]);

    expect(fields.map((item) => item.name)).toEqual(["Nombre", "Empresa", "Correo"]);
  });

  it("orders fields by sortOrder and ignores display listOrder compatibility data", () => {
    const fields = getImportableFields([
      field({ id: "a", name: "A", sortOrder: 1 }),
      field({ id: "b", name: "B", sortOrder: 2, config: { display: { listOrder: 0 } } }),
    ]);

    expect(fields.map((item) => item.name)).toEqual(["A", "B"]);
  });

  it("rejects duplicate visible names", () => {
    expect(() =>
      getImportableFields([
        field({ id: "a", name: "Nombre" }),
        field({ id: "b", name: "Nombre" }),
      ]),
    ).toThrow(EntityImportUserError);
  });

  it("allows required relations because they are imported by displayName", () => {
    expect(() =>
      assertEntityImportable([
        field({ id: "name", name: "Nombre" }),
        field({ id: "rel", name: "Empresa", type: "RELATION", required: true }),
      ]),
    ).not.toThrow();
  });

  it("does not block basic import for required file or image fields", () => {
    expect(() =>
      assertEntityImportable([
        field({ id: "file", name: "Archivo", type: "FILE", required: true }),
        field({ id: "image", name: "Imagen", type: "IMAGE", required: true }),
      ]),
    ).not.toThrow();
  });

  it("generates exact headers in a simple xlsx workbook", async () => {
    const buffer = await generateEntityTemplate({
      entityName: "Personas con nombre larguísimo que Excel debe cortar",
      fields: [
        field({ id: "name", name: "Nombre" }),
        field({ id: "email", name: "Correo", type: "EMAIL" }),
      ],
    });
    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.load(buffer);

    expect(workbook.worksheets).toHaveLength(1);
    expect(workbook.worksheets[0].getRow(1).values).toMatchObject([
      undefined,
      "Nombre",
      "Correo",
    ]);
    expect(workbook.worksheets[0].views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(templateFileName("Personas Demo")).toBe("personas_demo_plantilla.xlsx");
  });
});

describe("entity import structure and values", () => {
  it("rejects missing, unknown, duplicate, and empty headers", async () => {
    const fields = [field({ id: "name", name: "Nombre" }), field({ id: "email", name: "Correo" })];

    await expect(
      parseExcelRows({ fields, file: await workbookFile(["Nombre"]) }),
    ).rejects.toThrow(EntityImportUserError);
    await expect(
      parseExcelRows({ fields, file: await workbookFile(["Nombre", "Otro"]) }),
    ).rejects.toThrow(EntityImportUserError);
    await expect(
      parseExcelRows({ fields, file: await workbookFile(["Correo", "Nombre"]) }),
    ).rejects.toThrow(EntityImportUserError);
    await expect(
      parseExcelRows({ fields, file: await workbookFile(["Nombre", "Nombre"]) }),
    ).rejects.toThrow(EntityImportUserError);
    await expect(parseExcelRows({ fields, file: await workbookFile(["", "Correo"]) })).rejects.toThrow(
      EntityImportUserError,
    );
  });

  it("ignores empty rows and enforces row limits through parsed rows", async () => {
    const fields = [field({ name: "Nombre" })];
    const rows = await parseExcelRows({
      fields,
      file: await workbookFile(["Nombre"], [["Ana"], [""], ["  "], ["Luis"]]),
    });

    expect(rows).toHaveLength(2);
  });

  it("rejects files over the centralized size limit", async () => {
    const file = new File(
      [new Uint8Array(ENTITY_IMPORT_LIMITS.maxFileSizeBytes + 1)],
      "plantilla.xlsx",
      {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    );

    await expect(parseExcelRows({ fields: [field()], file })).rejects.toThrow(
      "El archivo no puede superar 5 MB.",
    );
  });

  it("rejects files with more than 5,000 data rows", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Plantilla");

    sheet.addRow(["Nombre"]);
    for (let index = 0; index <= ENTITY_IMPORT_LIMITS.maxRows; index += 1) {
      sheet.addRow([`Persona ${index}`]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const file = new File([buffer], "plantilla.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    await expect(parseExcelRows({ fields: [field()], file })).rejects.toThrow(
      "Puedes importar hasta 5000 filas por archivo.",
    );
  });

  it("accepts exported data headers with __record_id as the first column", async () => {
    const fields = [field({ id: "name", name: "Nombre" })];
    const rows = await parseExcelRows({
      fields,
      file: await workbookFile([RECORD_ID_HEADER, "Nombre"], [["record_1", "Ana"]]),
    });

    expect(rows).toEqual([
      expect.objectContaining({
        recordId: "record_1",
        rowNumber: 2,
        valuesByHeader: new Map([["Nombre", "Ana"]]),
      }),
    ]);
  });

  it("rejects __record_id in any position other than the first column", async () => {
    await expect(
      parseExcelRows({
        fields: [field({ id: "name", name: "Nombre" })],
        file: await workbookFile(["Nombre", RECORD_ID_HEADER], [["Ana", "record_1"]]),
      }),
    ).rejects.toThrow(EntityImportUserError);
  });

  it("uses simple formula results and rejects formulas without a result", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Plantilla");

    sheet.addRow(["Nombre"]);
    sheet.addRow([{ formula: '"Ana"', result: "Ana" }]);
    sheet.addRow([{ formula: '"Luis"' }]);

    const buffer = await workbook.xlsx.writeBuffer();
    const file = new File([buffer], "plantilla.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    await expect(parseExcelRows({ fields: [field()], file })).rejects.toThrow(
      "No fue posible leer el archivo. Verifica que sea una plantilla Excel válida.",
    );
  });

  it("normalizes supported types and validates options", async () => {
    const fields = [
      field({ id: "text", name: "Texto", type: "TEXT" }),
      field({ id: "int", name: "Entero", type: "INTEGER" }),
      field({ id: "dec", name: "Decimal", type: "DECIMAL" }),
      field({ id: "bool", name: "Booleano", type: "BOOLEAN" }),
      field({ id: "date", name: "Fecha", type: "DATE" }),
      field({ id: "datetime", name: "Fecha hora", type: "DATETIME" }),
      field({ id: "time", name: "Hora", type: "TIME" }),
      field({
        id: "select",
        name: "Estado",
        type: "SELECT",
        options: [{ id: "o1", label: "Activo", value: "activo", sortOrder: 1, isActive: true }],
      }),
      field({
        id: "multi",
        name: "Tags",
        type: "MULTISELECT",
        options: [
          { id: "o2", label: "A", value: "a", sortOrder: 1, isActive: true },
          { id: "o3", label: "B", value: "b", sortOrder: 2, isActive: true },
        ],
      }),
    ];
    const rows = await parseExcelRows({
      fields,
      file: await workbookFile(
        fields.map((item) => item.name),
        [["abc", "10", 2.5, "Sí", "2026-01-02", "2026-01-02T10:00:00Z", "08:30", "Activo", "A; B; A"]],
      ),
    });
    const result = await validateImportRows({ fields, rows });

    expect(result.errors).toEqual([]);
    expect(result.validRows[0].values).toMatchObject([
      { fieldId: "text", textValue: "abc" },
      { fieldId: "int", integerValue: 10 },
      { fieldId: "dec" },
      { fieldId: "bool", booleanValue: true },
      { fieldId: "date" },
      { fieldId: "datetime" },
      { fieldId: "time", textValue: "08:30" },
      { fieldId: "select", textValue: "activo" },
      { fieldId: "multi", jsonValue: ["a", "b"] },
    ]);
    expect(result.validRows[0].values[4].dateValue?.toISOString()).toBe(
      "2026-01-02T00:00:00.000Z",
    );
  });

  it("resolves a RELATION displayName to the targetRecordId", async () => {
    const fields = [field({ id: "name", name: "Nombre" }), relationField()];
    const rows = await parseExcelRows({
      fields,
      file: await workbookFile(["Nombre", "Departamento"], [["Ana", "Oficina Técnica"]]),
    });
    const result = await validateImportRows({
      fields,
      rows,
      relationTargetLookup: relationLookup({
        "Oficina Técnica": [{ id: "target_department_1" }],
      }),
    });

    expect(result.errors).toEqual([]);
    expect(result.validRows[0].relations).toEqual([
      { fieldId: "department", targetRecordIds: ["target_department_1"] },
    ]);
  });

  it("rejects missing relation targets by displayName", async () => {
    const fields = [relationField()];
    const rows = await parseExcelRows({
      fields,
      file: await workbookFile(["Departamento"], [["No existe"]]),
    });
    const result = await validateImportRows({
      fields,
      rows,
      relationTargetLookup: relationLookup({}),
    });

    expect(result.validRows).toHaveLength(0);
    expect(result.errors).toEqual([
      {
        row: 2,
        field: "Departamento",
        message: "No existe un registro relacionado con displayName “No existe”.",
      },
    ]);
  });

  it("rejects ambiguous relation displayNames", async () => {
    const fields = [relationField()];
    const rows = await parseExcelRows({
      fields,
      file: await workbookFile(["Departamento"], [["Duplicado"]]),
    });
    const result = await validateImportRows({
      fields,
      rows,
      relationTargetLookup: relationLookup({
        Duplicado: [{ id: "target_1" }, { id: "target_2" }],
      }),
    });

    expect(result.validRows).toHaveLength(0);
    expect(result.errors).toEqual([
      {
        row: 2,
        field: "Departamento",
        message: "El displayName “Duplicado” es ambiguo para Departamento.",
      },
    ]);
  });

  it("rejects relation targets outside the current contract or configured entity", async () => {
    const fields = [relationField()];
    const rows = await parseExcelRows({
      fields,
      file: await workbookFile(["Departamento"], [["Otro contrato"]]),
    });
    const result = await validateImportRows({
      fields,
      rows,
      relationTargetLookup: relationLookup({}),
    });

    expect(result.errors).toEqual([
      {
        row: 2,
        field: "Departamento",
        message: "No existe un registro relacionado con displayName “Otro contrato”.",
      },
    ]);
  });

  it("resolves multiple RELATION displayNames with a stable pipe separator", async () => {
    const fields = [relationField({ multiple: true, name: "Departamentos" })];
    const rows = await parseExcelRows({
      fields,
      file: await workbookFile(
        ["Departamentos"],
        [[`Oficina Técnica${RELATION_IMPORT_EXPORT_SEPARATOR}Minería | Bodega`]],
      ),
    });
    const result = await validateImportRows({
      fields,
      rows,
      relationTargetLookup: relationLookup({
        "Oficina Técnica": [{ id: "target_1" }],
        Minería: [{ id: "target_2" }],
        Bodega: [{ id: "target_3" }],
      }),
    });

    expect(result.errors).toEqual([]);
    expect(result.validRows[0].relations).toEqual([
      { fieldId: "department", targetRecordIds: ["target_1", "target_2", "target_3"] },
    ]);
  });

  it.each(["MASTER", "TRANSACTION", "REFERENCE"] as const)(
    "uses the same relation import behavior for %s targets",
    async (nature) => {
      const fields = [relationField()];
      const rows = await parseExcelRows({
        fields,
        file: await workbookFile(["Departamento"], [["Oficina Técnica"]]),
      });
      const result = await validateImportRows({
        fields,
        rows,
        relationTargetLookup: relationLookup({
          "Oficina Técnica": [{ id: `target_${nature.toLowerCase()}` }],
        }),
      });

      expect(result.errors).toEqual([]);
      expect(result.validRows[0].relations[0].targetRecordIds).toEqual([
        `target_${nature.toLowerCase()}`,
      ]);
    },
  );

  it.each(["TEXT", "TEXTAREA"] as const)(
    "preserves literal Excel text for %s fields without numeric parsing",
    async (type) => {
      const fields = [field({ id: "text", name: "Texto", type })];
      const samples = [
        "0+304,43",
        "00123",
        "+123",
        "0007",
        "12-AB",
        "1.000,50",
        "08:30",
      ];
      const rows = await parseExcelRows({
        fields,
        file: await workbookFile(["Texto"], samples.map((value) => [value])),
      });
      const result = await validateImportRows({ fields, rows });

      expect(result.errors).toEqual([]);
      expect(result.validRows.map((row) => row.values[0].textValue)).toEqual(samples);
    },
  );

  it("preserves formatted numeric-looking Excel cells when importing into TEXT", async () => {
    const fields = [field({ id: "text", name: "Texto", type: "TEXT" })];
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Plantilla");

    sheet.addRow(["Texto"]);
    sheet.getCell("A2").value = 304.43;
    sheet.getCell("A2").numFmt = "0+000,00";
    sheet.getCell("A3").value = 123;
    sheet.getCell("A3").numFmt = "00000";
    sheet.getCell("A4").value = 7;
    sheet.getCell("A4").numFmt = "0000";

    const buffer = await workbook.xlsx.writeBuffer();
    const file = new File([buffer], "plantilla.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const rows = await parseExcelRows({ fields, file });
    const result = await validateImportRows({ fields, rows });

    expect(result.errors).toEqual([]);
    expect(result.validRows.map((row) => row.values[0].textValue)).toEqual([
      "0+304,43",
      "00123",
      "0007",
    ]);
  });

  it("normalizes manual input and Excel rows to equivalent EntityValue payloads", async () => {
    const fields = [
      field({ id: "text", name: "Texto", type: "TEXT" }),
      field({ id: "int", name: "Entero", type: "INTEGER" }),
      field({ id: "dec", name: "Decimal", type: "DECIMAL" }),
      field({ id: "money", name: "Monto", type: "MONEY", config: { money: { currency: "UF" } } }),
      field({ id: "bool", name: "Booleano", type: "BOOLEAN" }),
      field({ id: "date", name: "Fecha", type: "DATE" }),
      field({ id: "time", name: "Hora", type: "TIME" }),
      field({
        id: "select",
        name: "Estado",
        type: "SELECT",
        options: [{ id: "o1", label: "Aprobado", value: "aprobado", sortOrder: 1, isActive: true }],
      }),
      field({
        id: "multi",
        name: "Estados",
        type: "MULTISELECT",
        options: [
          { id: "o2", label: "Aprobado", value: "aprobado", sortOrder: 1, isActive: true },
          { id: "o3", label: "Pendiente", value: "pendiente", sortOrder: 2, isActive: true },
        ],
      }),
    ];
    const manualFormData = new FormData();

    manualFormData.set(fieldInputName("text"), "Texto demo");
    manualFormData.set(fieldInputName("int"), "2147483647");
    manualFormData.set(fieldInputName("dec"), "10.5");
    manualFormData.set(fieldInputName("money"), "5269808713");
    manualFormData.set(fieldInputName("bool"), "true");
    manualFormData.set(fieldInputName("date"), "2026-01-21");
    manualFormData.set(fieldInputName("time"), "14:45");
    manualFormData.set(fieldInputName("select"), "aprobado");
    manualFormData.append(fieldInputName("multi"), "aprobado");
    manualFormData.append(fieldInputName("multi"), "pendiente");

    const excelRows = await parseExcelRows({
      fields,
      file: await workbookFile(
        fields.map((item) => item.name),
        [["Texto demo", 2147483647, 10.5, 5269808713, "true", "2026-01-21", "14:45", "Aprobado", "Aprobado; Pendiente"]],
      ),
    });
    const manualValues = validateRecordValues({ fields, formData: manualFormData, mode: "create" });
    const excelValues = (await validateImportRows({ fields, rows: excelRows })).validRows[0].values;

    expect(toComparableValues(excelValues)).toEqual(toComparableValues(manualValues));
  });

  it("imports Excel DATE cells as calendar dates without timezone drift", async () => {
    const fields = [field({ id: "date", name: "Fecha", type: "DATE" })];
    const rows = await parseExcelRows({
      fields,
      file: await workbookFile(["Fecha"], [[new Date("2026-01-21T00:00:00.000Z")]]),
    });
    const result = await validateImportRows({ fields, rows });

    expect(result.errors).toEqual([]);
    expect(result.validRows[0].values[0].dateValue?.toISOString()).toBe(
      "2026-01-21T00:00:00.000Z",
    );
  });

  it("imports MONEY cells as clean numeric decimals", async () => {
    const fields = [field({ id: "money", name: "Monto neto", type: "MONEY" })];
    const rows = await parseExcelRows({
      fields,
      file: await workbookFile(["Monto neto"], [[5269808713]]),
    });
    const result = await validateImportRows({ fields, rows });

    expect(result.errors).toEqual([]);
    expect(result.validRows[0].values[0].decimalValue?.toString()).toBe("5269808713");
  });

  it("rejects invalid TIME values from Excel", async () => {
    const fields = [field({ id: "time", name: "Hora inicio", type: "TIME" })];
    const rows = await parseExcelRows({
      fields,
      file: await workbookFile(["Hora inicio"], [["08:30"], ["8:30"], ["24:00"]]),
    });
    const result = await validateImportRows({ fields, rows });

    expect(result.validRows[0].values[0]).toMatchObject({ fieldId: "time", textValue: "08:30" });
    expect(result.errors).toEqual([
      {
        row: 3,
        field: "Hora inicio",
        message: "Debe ser una hora válida en formato HH:mm.",
      },
      {
        row: 4,
        field: "Hora inicio",
        message: "Debe ser una hora válida en formato HH:mm.",
      },
    ]);
  });

  it("applies the same INT4 range validation for Excel integer cells", async () => {
    const fields = [field({ id: "int", name: "Entero", type: "INTEGER" })];
    const rows = await parseExcelRows({
      fields,
      file: await workbookFile(["Entero"], [[2147483647], [-2147483648], [2147483648], [5269808713], [1.5]]),
    });
    const result = await validateImportRows({ fields, rows });

    expect(result.validRows).toHaveLength(2);
    expect(result.errors).toEqual([
      {
        row: 4,
        field: "Entero",
        message: "Debe estar entre -2147483648 y 2147483647.",
      },
      {
        row: 5,
        field: "Entero",
        message: "Debe estar entre -2147483648 y 2147483647.",
      },
      {
        row: 6,
        field: "Entero",
        message: "Debe ser un número entero.",
      },
    ]);
  });

  it("keeps blank optional Excel booleans empty instead of importing false", async () => {
    const fields = [field({ id: "bool", name: "Booleano", type: "BOOLEAN" })];
    const rows = await parseExcelRows({
      fields,
      file: await workbookFile(["Booleano"], [[""], ["No"], ["Sí"]]),
    });
    const result = await validateImportRows({ fields, rows });

    expect(result.errors).toEqual([]);
    expect(result.validRows).toHaveLength(2);
    expect(result.validRows.map((row) => row.values[0].booleanValue)).toEqual([false, true]);
  });

  it("reports validation errors and blocks valid rows for that file row", async () => {
    const fields = [
      field({ id: "name", name: "Nombre", required: true }),
      field({ id: "rut", name: "RUT" }),
    ];
    const rows = await parseExcelRows({
      fields,
      file: await workbookFile(["Nombre", "RUT"], [["", "1"]]),
    });
    const result = await validateImportRows({ fields, rows });

    expect(result.validRows).toHaveLength(0);
    expect(result.errors[0]).toMatchObject({ field: "Nombre" });
  });

  it("reports invalid date values on the visible field name", async () => {
    const fields = [field({ id: "date", name: "Fecha", type: "DATE" })];
    const rows = await parseExcelRows({
      fields,
      file: await workbookFile(["Fecha"], [["02/01/2026"]]),
    });
    const result = await validateImportRows({ fields, rows });

    expect(result.errors).toEqual([
      {
        row: 2,
        field: "Fecha",
        message: "Debe ser una fecha válida en formato YYYY-MM-DD.",
      },
    ]);
  });

  it("validates unique values inside the file and against existing values", async () => {
    const fields = [field({ id: "rut", name: "RUT", isUnique: true })];
    const rows = await parseExcelRows({
      fields,
      file: await workbookFile(["RUT"], [["1"], ["1"], ["2"]]),
    });
    const result = await validateImportRows({
      fields,
      rows,
      existingUniqueValues: async () => new Set(["text:2"]),
    });

    expect(result.errors).toEqual([
      { row: 3, field: "RUT", message: "Este valor está duplicado dentro del archivo." },
      { row: 4, field: "RUT", message: "Este valor ya existe." },
    ]);
  });

  it("applies default values during creation validation", async () => {
    const fields = [
      field({
        id: "status",
        name: "Estado",
        config: { defaultValue: "Activo" },
      }),
      field({ id: "rut", name: "RUT" }),
    ];
    const rows = await parseExcelRows({
      fields,
      file: await workbookFile(["Estado", "RUT"], [["", "1"]]),
    });
    const result = await validateImportRows({ fields, rows });

    expect(result.validRows[0].values[0]).toMatchObject({
      fieldId: "status",
      textValue: "Activo",
    });
  });

  it("classifies rows with __record_id as updates and rows without it as creates", async () => {
    const fields = [field({ id: "name", name: "Nombre", required: true })];
    const rows = await parseExcelRows({
      fields,
      file: await workbookFile([RECORD_ID_HEADER, "Nombre"], [["record_1", "Ana editada"], ["", "Luis"]]),
    });
    const result = await validateImportRows({
      fields,
      rows,
      existingRecords: [existingRecord("record_1", [{ entityFieldId: "name", textValue: "Ana" }])],
    });

    expect(result.errors).toEqual([]);
    expect(result.validRows.map((row) => row.recordId ?? null)).toEqual(["record_1", null]);
    expect(result.changeCount).toBe(1);
  });

  it("rejects missing and duplicated record ids during update validation", async () => {
    const fields = [field({ id: "name", name: "Nombre" })];
    const rows = await parseExcelRows({
      fields,
      file: await workbookFile([RECORD_ID_HEADER, "Nombre"], [
        ["missing", "Ana"],
        ["record_1", "Luis"],
        ["record_1", "Luis 2"],
      ]),
    });
    const result = await validateImportRows({
      fields,
      rows,
      existingRecords: [existingRecord("record_1", [])],
    });

    expect(result.errors).toEqual([
      {
        row: 2,
        field: RECORD_ID_HEADER,
        message: "El registro indicado ya no existe.",
      },
      {
        row: 4,
        field: RECORD_ID_HEADER,
        message: "El identificador de registro está duplicado dentro del archivo.",
      },
    ]);
  });

  it("treats blank update cells as clear, keeps defaults off, and validates required fields", async () => {
    const fields = [
      field({ id: "name", name: "Nombre", required: true }),
      field({ id: "status", name: "Estado", config: { defaultValue: "Activo" } }),
    ];
    const rows = await parseExcelRows({
      fields,
      file: await workbookFile([RECORD_ID_HEADER, "Nombre", "Estado"], [
        ["record_1", "Ana", ""],
        ["record_2", "", "Activo"],
      ]),
    });
    const result = await validateImportRows({
      fields,
      rows,
      existingRecords: [
        existingRecord("record_1", [
          { entityFieldId: "name", textValue: "Ana" },
          { entityFieldId: "status", textValue: "Pendiente" },
        ]),
        existingRecord("record_2", [{ entityFieldId: "name", textValue: "Luis" }]),
      ],
    });

    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0].values).toEqual([{ fieldId: "name", textValue: "Ana" }]);
    expect(result.errors).toEqual([
      {
        row: 3,
        field: "Nombre",
        message: "Este campo es obligatorio.",
      },
    ]);
  });

  it("validates unique values against the final batch state", async () => {
    const fields = [field({ id: "code", name: "Código", isUnique: true })];
    const rows = await parseExcelRows({
      fields,
      file: await workbookFile([RECORD_ID_HEADER, "Código"], [
        ["record_a", "B"],
        ["record_b", "C"],
        ["", "A"],
        ["", "C"],
      ]),
    });
    const result = await validateImportRows({
      fields,
      rows,
      existingRecords: [
        existingRecord("record_a", [{ entityFieldId: "code", textValue: "A" }]),
        existingRecord("record_b", [{ entityFieldId: "code", textValue: "B" }]),
      ],
      existingUniqueValues: async () => new Map([
        ["text:A", "record_a"],
        ["text:B", "record_b"],
        ["text:Z", "record_z"],
      ]),
    });

    expect(result.errors).toEqual([
      {
        row: 5,
        field: "Código",
        message: "Este valor está duplicado dentro del archivo.",
      },
    ]);
    expect(result.validRows).toHaveLength(3);
  });

  it("rejects invalid file types", async () => {
    const file = new File(["not excel"], "datos.csv", { type: "text/csv" });

    await expect(parseExcelRows({ fields: [field()], file })).rejects.toThrow(
      "Selecciona una plantilla Excel descargada desde esta entidad.",
    );
  });
});

describe("entity import persistence plan", () => {
  function validRows(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      rowNumber: index + 2,
      displayName: `Persona ${index + 1}`,
      relations: [],
      values: [
        { fieldId: "name", textValue: `Persona ${index + 1}` },
        { fieldId: "rut", textValue: `RUT-${index + 1}` },
      ],
    }));
  }

  function planFor(count: number) {
    return buildImportPersistencePlan({
      contractId: "contract_1",
      entityTypeId: "entity_1",
      entityTypeName: "Personas",
      fields: [
        field({ id: "name", name: "Nombre" }),
        field({ id: "rut", name: "RUT" }),
      ],
      rows: validRows(count),
      userId: "user_1",
    });
  }

  it("builds batched persistence data for 1 row", () => {
    const plan = planFor(1);

    expect(plan.records).toHaveLength(1);
    expect(plan.values).toHaveLength(2);
    expect(plan.auditEvents).toHaveLength(1);
    expect(plan.auditChanges).toHaveLength(2);
    expect(plan.values[0].entityRecordId).toBe(plan.records[0].id);
    expect(plan.auditChanges[0].auditEventId).toBe(plan.auditEvents[0].id);
  });

  it.each([100, 414, 500])("builds batched persistence data for %i rows", (rowCount) => {
    const plan = planFor(rowCount);

    expect(plan.records).toHaveLength(rowCount);
    expect(plan.values).toHaveLength(rowCount * 2);
    expect(plan.auditEvents).toHaveLength(rowCount);
    expect(plan.auditChanges).toHaveLength(rowCount * 2);
    expect(new Set(plan.records.map((record) => record.id))).toHaveLength(rowCount);
  });

  it("omits empty values but keeps record and audit event creation", () => {
    const plan = buildImportPersistencePlan({
      contractId: "contract_1",
      entityTypeId: "entity_1",
      entityTypeName: "Personas",
      fields: [field({ id: "name", name: "Nombre" })],
      rows: [
        {
          rowNumber: 2,
          displayName: "Registro sin nombre",
          relations: [],
          values: [{ fieldId: "name", textValue: null }],
        },
      ],
      userId: "user_1",
    });

    expect(plan.records).toHaveLength(1);
    expect(plan.values).toHaveLength(0);
    expect(plan.auditEvents).toHaveLength(1);
    expect(plan.auditChanges).toHaveLength(0);
  });

  it("builds update persistence without false audit changes for identical fields", () => {
    const fields = [
      field({ id: "name", name: "Nombre" }),
      field({ id: "cargo", name: "Cargo" }),
    ];
    const plan = buildImportPersistencePlan({
      contractId: "contract_1",
      entityTypeId: "entity_1",
      entityTypeName: "Personas",
      fields,
      existingRecords: [
        existingRecord("record_1", [
          { entityFieldId: "name", textValue: "Ana" },
          { entityFieldId: "cargo", textValue: "Analista" },
        ]),
      ],
      rows: [
        {
          rowNumber: 2,
          recordId: "record_1",
          displayName: "Ana",
          relations: [],
          values: [
            { fieldId: "name", textValue: "Ana" },
            { fieldId: "cargo", textValue: "Jefa" },
          ],
        },
      ],
      userId: "user_1",
    });

    expect(plan.records).toHaveLength(0);
    expect(plan.updatedRecordIds).toEqual(["record_1"]);
    expect(plan.auditEvents).toMatchObject([{ action: "RECORD_UPDATED" }]);
    expect(plan.auditChanges).toEqual([
      expect.objectContaining({
        entityFieldId: "cargo",
        fieldName: "Cargo",
        oldValue: "Analista",
        newValue: "Jefa",
      }),
    ]);
  });

  it("builds batch plans for 400 updates and mixed 200 create plus 200 update rows", () => {
    const fields = [field({ id: "name", name: "Nombre" })];
    const updateRows = Array.from({ length: 400 }, (_, index) => ({
      rowNumber: index + 2,
      recordId: `record_${index}`,
      displayName: `Persona ${index} editada`,
      relations: [],
      values: [{ fieldId: "name", textValue: `Persona ${index} editada` }],
    }));
    const existingRecords = Array.from({ length: 400 }, (_, index) =>
      existingRecord(`record_${index}`, [{ entityFieldId: "name", textValue: `Persona ${index}` }]),
    );
    const updatePlan = buildImportPersistencePlan({
      contractId: "contract_1",
      entityTypeId: "entity_1",
      entityTypeName: "Personas",
      existingRecords,
      fields,
      rows: updateRows,
      userId: "user_1",
    });
    const mixedPlan = buildImportPersistencePlan({
      contractId: "contract_1",
      entityTypeId: "entity_1",
      entityTypeName: "Personas",
      existingRecords: existingRecords.slice(0, 200),
      fields,
      rows: [
        ...updateRows.slice(0, 200),
        ...validRows(200),
      ],
      userId: "user_1",
    });

    expect(updatePlan.updatedRecordIds).toHaveLength(400);
    expect(updatePlan.records).toHaveLength(0);
    expect(updatePlan.values).toHaveLength(400);
    expect(mixedPlan.updatedRecordIds).toHaveLength(200);
    expect(mixedPlan.records).toHaveLength(200);
    expect(mixedPlan.values).toHaveLength(600);
  });
});

describe("entity import persistence errors", () => {
  it("maps unique race errors to a revalidation message", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unique failed", {
      clientVersion: "test",
      code: "P2002",
    });

    expect(friendlyImportPersistenceError(error)).toBe(
      "Los datos cambiaron desde la validación. Vuelve a validar el archivo.",
    );
  });

  it("maps transaction timeouts to a no-partial-write message", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Transaction already closed", {
      clientVersion: "test",
      code: "P2028",
    });

    expect(friendlyImportPersistenceError(error)).toBe(
      "La importación tardó más de lo permitido. No se creó ningún registro.",
    );
  });

  it("maps unknown DB persistence errors without exposing internals", () => {
    expect(friendlyImportPersistenceError(new Error("database exploded"))).toBe(
      "No fue posible guardar los registros. No se importó ninguna fila.",
    );
  });
});
