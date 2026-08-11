import ExcelJS from "exceljs";
import { Prisma, type EntityFieldType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  ENTITY_IMPORT_LIMITS,
  EntityImportUserError,
  assertEntityImportable,
  buildImportPersistencePlan,
  friendlyImportPersistenceError,
  generateEntityTemplate,
  getImportableFields,
  parseExcelRows,
  templateFileName,
  validateImportRows,
} from "./entity-import";

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
    multiple: false,
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

describe("entity import template", () => {
  it("includes active supported fields and excludes inactive/relation/file/image fields without reordering remaining fields", () => {
    const fields = getImportableFields([
      field({ id: "name", name: "Nombre", type: "TEXT", sortOrder: 1 }),
      field({ id: "old", name: "Antiguo", type: "TEXT", isActive: false }),
      field({ id: "rel", name: "Empresa", type: "RELATION" }),
      field({ id: "file", name: "Archivo", type: "FILE" }),
      field({ id: "image", name: "Imagen", type: "IMAGE" }),
      field({ id: "email", name: "Correo", type: "EMAIL", sortOrder: 2 }),
    ]);

    expect(fields.map((item) => item.name)).toEqual(["Nombre", "Correo"]);
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

  it("blocks basic import when an active required relation exists", () => {
    expect(() =>
      assertEntityImportable([
        field({ id: "name", name: "Nombre" }),
        field({ id: "rel", name: "Empresa", type: "RELATION", required: true }),
      ]),
    ).toThrow("Esta entidad contiene relaciones obligatorias");
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
        [["abc", "10", 2.5, "Sí", "2026-01-02", "2026-01-02T10:00:00Z", "Activo", "A; B; A"]],
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
      { fieldId: "select", textValue: "activo" },
      { fieldId: "multi", jsonValue: ["a", "b"] },
    ]);
    expect(result.validRows[0].values[4].dateValue?.toISOString()).toBe(
      "2026-01-02T00:00:00.000Z",
    );
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
