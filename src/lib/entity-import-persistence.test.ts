import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RELATION_IMPORT_EXPORT_SEPARATOR,
  generateEntityExport,
  importEntityRecords,
} from "./entity-import";
import { prisma } from "./prisma";

const mocks = vi.hoisted(() => ({
  getAuthorizedRecordEntityType: vi.fn(),
}));

vi.mock("./entity-records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./entity-records")>()),
  getAuthorizedRecordEntityType: mocks.getAuthorizedRecordEntityType,
}));

vi.mock("./prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    entityValue: {
      findMany: vi.fn(async () => []),
    },
    entityRecord: {
      findMany: vi.fn(async () => []),
    },
    $queryRaw: vi.fn(async () => []),
  },
}));

const transaction = vi.mocked(prisma.$transaction);
const entityRecordFindMany = vi.mocked(prisma.entityRecord.findMany);
const queryRaw = vi.mocked(prisma.$queryRaw);

function importField(overrides: Record<string, unknown> = {}) {
  return {
    id: String(overrides.id ?? "field_name"),
    entityTypeId: "entity_1",
    name: String(overrides.name ?? "Nombre"),
    key: String(overrides.key ?? "nombre"),
    description: null,
    type: overrides.type ?? "TEXT",
    required: Boolean(overrides.required ?? true),
    isUnique: Boolean(overrides.isUnique ?? false),
    searchable: Boolean(overrides.searchable ?? false),
    multiple: Boolean(overrides.multiple ?? false),
    sortOrder: Number(overrides.sortOrder ?? 1),
    config: overrides.config ?? null,
    isActive: Boolean(overrides.isActive ?? true),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    options: overrides.options ?? [],
  };
}

function importContext(fields = [importField()]) {

  return {
    contract: { id: "contract_1" },
    entityType: {
      id: "entity_1",
      name: "Personas",
      fields,
    },
    importableFields: fields,
  };
}

async function workbookFile(rowCount: number, headers = ["Nombre"], rows?: unknown[][]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Plantilla");

  sheet.addRow(headers);

  if (rows) {
    for (const row of rows) {
      sheet.addRow(row);
    }
  } else {
    for (let index = 0; index < rowCount; index += 1) {
      sheet.addRow([`Persona ${index + 1}`]);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new File([buffer], "plantilla.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function tx() {
  return {
    entityRecord: {
      create: vi.fn(),
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
    },
    entityRelation: {
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    entityValue: {
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    auditEvent: {
      create: vi.fn(),
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
    },
    auditChange: {
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
    },
    entityField: {
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    entityType: {
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    fieldOption: {
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    $executeRaw: vi.fn(async () => ({ count: 1 })),
  };
}

function value(entityFieldId: string, overrides: Record<string, unknown> = {}) {
  return {
    entityFieldId,
    textValue: null,
    integerValue: null,
    decimalValue: null,
    booleanValue: null,
    dateValue: null,
    jsonValue: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthorizedRecordEntityType.mockResolvedValue(importContext());
});

describe("entity import persistence", () => {
  it("exports records with __record_id and human importable values", async () => {
    const fields = [
      importField({ id: "date", name: "Fecha", type: "DATE", sortOrder: 1 }),
      importField({ id: "money", name: "Monto", type: "MONEY", sortOrder: 2 }),
      importField({
        id: "status",
        name: "Estado",
        type: "SELECT",
        sortOrder: 3,
        options: [
          { id: "opt_aprobado", label: "Aprobado", value: "aprobado", sortOrder: 1, isActive: true },
        ],
      }),
      importField({
        id: "tags",
        name: "Tags",
        type: "MULTISELECT",
        sortOrder: 4,
        options: [
          { id: "opt_a", label: "A", value: "a", sortOrder: 1, isActive: true },
          { id: "opt_b", label: "B", value: "b", sortOrder: 2, isActive: true },
        ],
      }),
    ];
    mocks.getAuthorizedRecordEntityType.mockResolvedValue(importContext(fields));
    entityRecordFindMany
      .mockResolvedValueOnce([{ id: "record_1" }] as never)
      .mockResolvedValueOnce([
      {
        id: "record_1",
        displayName: "Persona 1",
        values: [
          value("date", { dateValue: new Date("2026-01-21T00:00:00.000Z") }),
          value("money", { decimalValue: { toString: () => "5269808713" } }),
          value("status", { textValue: "aprobado" }),
          value("tags", { jsonValue: ["a", "b"] }),
        ],
      },
    ] as never);

    const result = await generateEntityExport({
      contractId: "contract_1",
      entityTypeId: "entity_1",
      query: "persona",
      userId: "user_1",
    });
    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.load(result?.buffer as never);

    expect(result?.count).toBe(1);
    expect(workbook.worksheets[0].getRow(1).values).toMatchObject([
      undefined,
      "__record_id",
      "Fecha",
      "Monto",
      "Estado",
      "Tags",
    ]);
    expect(workbook.worksheets[0].getRow(2).values).toMatchObject([
      undefined,
      "record_1",
      "2026-01-21",
      "5269808713",
      "Aprobado",
      "A; B",
    ]);
    expect(entityRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ entityTypeId: "entity_1" }),
      }),
    );
    expect(entityRecordFindMany.mock.calls[0]?.[0]).toMatchObject({
      select: { id: true },
      orderBy: [{ displayName: "desc" }, { id: "asc" }],
    });
    expect(entityRecordFindMany.mock.calls[1]?.[0]).toMatchObject({
      where: {
        id: { in: ["record_1"] },
        entityTypeId: "entity_1",
      },
    });
    expect(entityRecordFindMany.mock.calls[1]?.[0]).not.toHaveProperty("take");
    expect(entityRecordFindMany.mock.calls[1]?.[0]).not.toHaveProperty("skip");
  });

  it("exports RELATION fields as target displayName values without technical ids", async () => {
    const fields = [
      importField({
        id: "field_department",
        name: "Departamento",
        type: "RELATION",
        required: false,
        config: { targetEntityTypeId: "departments", relationKind: "ONE" },
      }),
      importField({
        id: "field_departments",
        name: "Departamentos",
        type: "RELATION",
        required: false,
        multiple: true,
        sortOrder: 2,
        config: { targetEntityTypeId: "departments", relationKind: "MANY" },
      }),
    ];

    mocks.getAuthorizedRecordEntityType.mockResolvedValue(importContext(fields));
    entityRecordFindMany
      .mockResolvedValueOnce([{ id: "record_1" }] as never)
      .mockResolvedValueOnce([
        {
          id: "record_1",
          displayName: "Persona 1",
          values: [],
          outgoingRelations: [
            {
              sourceFieldId: "field_department",
              targetRecord: {
                displayName: "Oficina Técnica",
                entityTypeId: "departments",
                id: "target_record_1",
              },
              targetRecordId: "target_record_1",
            },
            {
              sourceFieldId: "field_departments",
              targetRecord: {
                displayName: "Minería",
                entityTypeId: "departments",
                id: "target_record_2",
              },
              targetRecordId: "target_record_2",
            },
            {
              sourceFieldId: "field_departments",
              targetRecord: {
                displayName: "Bodega",
                entityTypeId: "departments",
                id: "target_record_3",
              },
              targetRecordId: "target_record_3",
            },
          ],
        },
      ] as never);

    const result = await generateEntityExport({
      contractId: "contract_1",
      entityTypeId: "entity_1",
      userId: "user_1",
    });
    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.load(result?.buffer as never);

    expect(workbook.worksheets[0].getRow(2).values).toMatchObject([
      undefined,
      "record_1",
      "Oficina Técnica",
      `Minería${RELATION_IMPORT_EXPORT_SEPARATOR}Bodega`,
    ]);
    expect(JSON.stringify(workbook.worksheets[0].getRow(2).values)).not.toContain("target_record");
    expect(entityRecordFindMany.mock.calls[1]?.[0]).toMatchObject({
      include: expect.objectContaining({
        outgoingRelations: expect.objectContaining({
          include: expect.objectContaining({
            targetRecord: expect.objectContaining({
              select: expect.objectContaining({ displayName: true }),
            }),
          }),
        }),
      }),
    });
  });

  it.each([
    ["displayName", "asc", [{ displayName: "asc" }, { id: "asc" }] as const],
    ["displayName", "desc", [{ displayName: "desc" }, { id: "asc" }] as const],
    ["updatedAt", "asc", [{ updatedAt: "asc" }, { displayName: "asc" }, { id: "asc" }] as const],
    ["updatedAt", "desc", [{ updatedAt: "desc" }, { displayName: "asc" }, { id: "asc" }] as const],
  ])("exports using visual %s %s ordering", async (sortKey, direction, orderBy) => {
    entityRecordFindMany
      .mockResolvedValueOnce([{ id: "record_2" }, { id: "record_1" }] as never)
      .mockResolvedValueOnce([
        { id: "record_1", displayName: "B", values: [] },
        { id: "record_2", displayName: "A", values: [] },
      ] as never);

    const result = await generateEntityExport({
      contractId: "contract_1",
      entityTypeId: "entity_1",
      sort: { key: sortKey, direction },
      userId: "user_1",
    });
    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.load(result?.buffer as never);

    expect(entityRecordFindMany.mock.calls[0]?.[0]).toMatchObject({
      select: { id: true },
      orderBy,
    });
    expect(entityRecordFindMany.mock.calls[1]?.[0]).not.toHaveProperty("take");
    expect(workbook.worksheets[0].getColumn(1).values).toMatchObject([
      undefined,
      "__record_id",
      "record_2",
      "record_1",
    ]);
  });

  it.each([
    ["TEXT", "field_text", "asc"],
    ["INTEGER", "field_integer", "desc"],
    ["MONEY", "field_money", "asc"],
    ["DATE", "field_date", "desc"],
    ["SELECT", "field_select", "asc"],
  ] as const)("exports using visual dynamic %s ordering", async (type, fieldId, direction) => {
    const fields = [
      importField({
        id: "field_name",
        name: "Nombre",
        config: { display: { primary: true } },
        sortOrder: 0,
      }),
      importField({
        id: fieldId,
        name: "Orden",
        type,
        required: false,
        config: { display: { showInList: true } },
        options: type === "SELECT"
          ? [
              { id: "opt_b", label: "Borrador", value: "draft", sortOrder: 1, isActive: true },
              { id: "opt_a", label: "Aprobado", value: "approved", sortOrder: 2, isActive: true },
            ]
          : [],
        sortOrder: 1,
      }),
    ];

    mocks.getAuthorizedRecordEntityType.mockResolvedValue(importContext(fields));
    queryRaw.mockResolvedValueOnce([{ id: "record_2" }, { id: "record_1" }]);
    entityRecordFindMany.mockResolvedValueOnce([
      { id: "record_1", displayName: "B", values: [] },
      { id: "record_2", displayName: "A", values: [] },
    ] as never);

    const result = await generateEntityExport({
      contractId: "contract_1",
      entityTypeId: "entity_1",
      sort: { key: `field:${fieldId}`, direction },
      userId: "user_1",
    });
    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.load(result?.buffer as never);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const sql = queryRaw.mock.calls[0]?.[0] as { strings?: string[] };
    expect(sql.strings?.join(" ")).toContain("IS NULL");
    expect(sql.strings?.join(" ")).not.toContain("LIMIT");
    if (type === "SELECT") {
      expect(sql.strings?.join(" ")).toContain("CASE");
    }
    expect(entityRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ["record_2", "record_1"] },
          entityTypeId: "entity_1",
        },
      }),
    );
    expect(workbook.worksheets[0].getColumn(1).values).toMatchObject([
      undefined,
      "__record_id",
      "record_2",
      "record_1",
    ]);
  });

  it("exports filtered search results using the requested visual sort", async () => {
    entityRecordFindMany
      .mockResolvedValueOnce([{ id: "record_3" }, { id: "record_1" }] as never)
      .mockResolvedValueOnce([
        { id: "record_1", displayName: "Enero B", values: [] },
        { id: "record_3", displayName: "Enero A", values: [] },
      ] as never);

    await generateEntityExport({
      contractId: "contract_1",
      entityTypeId: "entity_1",
      query: "enero",
      sort: { key: "displayName", direction: "asc" },
      userId: "user_1",
    });

    expect(entityRecordFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: expect.objectContaining({
        entityTypeId: "entity_1",
        OR: expect.any(Array),
      }),
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
    });
  });

  it("falls back safely for invalid export sort params", async () => {
    entityRecordFindMany
      .mockResolvedValueOnce([{ id: "record_1" }] as never)
      .mockResolvedValueOnce([{ id: "record_1", displayName: "Persona", values: [] }] as never);

    await generateEntityExport({
      contractId: "contract_1",
      entityTypeId: "entity_1",
      sort: { key: "field:does_not_exist", direction: "drop table" },
      userId: "user_1",
    });

    expect(entityRecordFindMany.mock.calls[0]?.[0]).toMatchObject({
      orderBy: [{ displayName: "desc" }, { id: "asc" }],
    });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("exports all matching records instead of the visible page size", async () => {
    const ids = Array.from({ length: 414 }, (_, index) => ({ id: `record_${index + 1}` }));
    const records = ids.map((item) => ({
      id: item.id,
      displayName: item.id,
      values: [],
    }));

    entityRecordFindMany
      .mockResolvedValueOnce(ids as never)
      .mockResolvedValueOnce(records.reverse() as never);

    const result = await generateEntityExport({
      contractId: "contract_1",
      entityTypeId: "entity_1",
      userId: "user_1",
    });

    expect(result?.count).toBe(414);
    expect(entityRecordFindMany.mock.calls[0]?.[0]).not.toHaveProperty("take");
    expect(entityRecordFindMany.mock.calls[0]?.[0]).not.toHaveProperty("skip");
    expect(entityRecordFindMany.mock.calls[1]?.[0]).not.toHaveProperty("take");
    expect(entityRecordFindMany.mock.calls[1]?.[0]).not.toHaveProperty("skip");
  });

  it("does not import when the entity type is outside the authorized contract", async () => {
    mocks.getAuthorizedRecordEntityType.mockResolvedValueOnce(null);

    await expect(
      importEntityRecords({
        contractId: "contract_1",
        entityTypeId: "foreign_entity",
        file: await workbookFile(1),
        userId: "user_1",
      }),
    ).resolves.toBeNull();

    expect(transaction).not.toHaveBeenCalled();
  });

  it("imports 414 valid rows with batched writes inside one transaction", async () => {
    const currentTx = tx();
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      importEntityRecords({
        contractId: "contract_1",
        entityTypeId: "entity_1",
        file: await workbookFile(414),
        userId: "user_1",
      }),
    ).resolves.toEqual({ createdCount: 414, importedCount: 414, updatedCount: 0 });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(currentTx.entityRecord.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({ displayName: "Persona 1" })]),
    });
    expect(currentTx.entityRecord.createMany.mock.calls[0][0].data[0]).not.toHaveProperty("status");
    expect(currentTx.entityRecord.createMany.mock.calls[0][0].data).toHaveLength(414);
    expect(currentTx.entityValue.createMany.mock.calls[0][0].data).toHaveLength(414);
    expect(currentTx.auditEvent.createMany.mock.calls[0][0].data).toHaveLength(414);
    expect(currentTx.auditChange.createMany.mock.calls[0][0].data).toHaveLength(414);
    expect(currentTx.entityRecord.create).not.toHaveBeenCalled();
    expect(currentTx.auditEvent.create).not.toHaveBeenCalled();
    expectConfigurationDelegatesNotTouched(currentTx);
  });

  it("imports SELECT labels as EntityValue text without changing field configuration", async () => {
    const estadoField = importField({
      id: "field_estado",
      name: "Estado",
      key: "estado",
      type: "SELECT",
      options: [
        { id: "opt_operativo", label: "Operativo", value: "operativo", sortOrder: 1, isActive: true },
        { id: "opt_mantencion", label: "En mantención", value: "en_mantencion", sortOrder: 2, isActive: true },
        { id: "opt_fuera", label: "Fuera de servicio", value: "fuera_de_servicio", sortOrder: 3, isActive: true },
      ],
    });
    const originalType = estadoField.type;
    const currentTx = tx();

    mocks.getAuthorizedRecordEntityType.mockResolvedValue(importContext([estadoField]));
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      importEntityRecords({
        contractId: "contract_1",
        entityTypeId: "entity_1",
        file: await workbookFile(3, ["Estado"], [["Operativo"], ["En mantención"], ["Operativo"]]),
        userId: "user_1",
      }),
    ).resolves.toEqual({ createdCount: 3, importedCount: 3, updatedCount: 0 });

    expect(estadoField.type).toBe(originalType);
    expect(currentTx.entityValue.createMany.mock.calls[0][0].data).toMatchObject([
      { entityFieldId: "field_estado", textValue: "operativo" },
      { entityFieldId: "field_estado", textValue: "en_mantencion" },
      { entityFieldId: "field_estado", textValue: "operativo" },
    ]);
    expectConfigurationDelegatesNotTouched(currentTx);
  });

  it("imports MULTISELECT labels as EntityValue jsonValue without changing field configuration", async () => {
    const estadoField = importField({
      id: "field_estado",
      name: "Estados",
      key: "estados",
      type: "MULTISELECT",
      options: [
        { id: "opt_operativo", label: "Operativo", value: "operativo", sortOrder: 1, isActive: true },
        { id: "opt_mantencion", label: "Mantención", value: "mantencion", sortOrder: 2, isActive: true },
      ],
    });
    const currentTx = tx();

    mocks.getAuthorizedRecordEntityType.mockResolvedValue(importContext([estadoField]));
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      importEntityRecords({
        contractId: "contract_1",
        entityTypeId: "entity_1",
        file: await workbookFile(1, ["Estados"], [["Operativo; Mantención"]]),
        userId: "user_1",
      }),
    ).resolves.toEqual({ createdCount: 1, importedCount: 1, updatedCount: 0 });

    expect(estadoField.type).toBe("MULTISELECT");
    expect(currentTx.entityValue.createMany.mock.calls[0][0].data[0]).toMatchObject({
      entityFieldId: "field_estado",
      jsonValue: ["operativo", "mantencion"],
    });
    expectConfigurationDelegatesNotTouched(currentTx);
  });

  it("imports RELATION displayNames as EntityRelation targetRecordId rows", async () => {
    const relationField = importField({
      id: "field_department",
      name: "Departamento",
      key: "departamento",
      type: "RELATION",
      required: false,
      config: { targetEntityTypeId: "departments", relationKind: "ONE" },
    });
    const currentTx = tx();

    mocks.getAuthorizedRecordEntityType.mockResolvedValue(importContext([relationField]));
    entityRecordFindMany.mockResolvedValueOnce([
      {
        id: "target_department_1",
        displayName: "Oficina Técnica",
        entityTypeId: "departments",
      },
    ] as never);
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      importEntityRecords({
        contractId: "contract_1",
        entityTypeId: "entity_1",
        file: await workbookFile(1, ["Departamento"], [["Oficina Técnica"]]),
        userId: "user_1",
      }),
    ).resolves.toEqual({ createdCount: 1, importedCount: 1, updatedCount: 0 });

    expect(entityRecordFindMany).toHaveBeenCalledWith({
      where: {
        displayName: { in: ["Oficina Técnica"] },
        entityType: {
          id: "departments",
          contractId: "contract_1",
        },
      },
      select: {
        id: true,
        displayName: true,
        entityTypeId: true,
      },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
    });
    expect(currentTx.entityValue.createMany).not.toHaveBeenCalled();
    expect(currentTx.entityRelation.createMany.mock.calls[0][0].data).toEqual([
      {
        sourceRecordId: expect.any(String),
        sourceFieldId: "field_department",
        targetRecordId: "target_department_1",
      },
    ]);
    expectConfigurationDelegatesNotTouched(currentTx);
  });

  it("updates exported records and creates new rows in one transaction", async () => {
    const currentTx = tx();
    const fields = [importField({ id: "field_name", name: "Nombre", required: true })];

    mocks.getAuthorizedRecordEntityType.mockResolvedValue(importContext(fields));
    entityRecordFindMany.mockResolvedValueOnce([
      {
        id: "record_1",
        displayName: "Ana",
        values: [value("field_name", { textValue: "Ana" })],
      },
    ] as never);
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      importEntityRecords({
        contractId: "contract_1",
        entityTypeId: "entity_1",
        file: await workbookFile(2, ["__record_id", "Nombre"], [["record_1", "Ana editada"], ["", "Luis"]]),
        userId: "user_1",
      }),
    ).resolves.toEqual({ createdCount: 1, importedCount: 2, updatedCount: 1 });

    expect(currentTx.$executeRaw).toHaveBeenCalled();
    expect(currentTx.entityValue.deleteMany).toHaveBeenCalledWith({
      where: {
        entityRecordId: { in: ["record_1"] },
        entityFieldId: { in: ["field_name"] },
      },
    });
    expect(currentTx.entityRecord.createMany.mock.calls[0][0].data).toHaveLength(1);
    expect(currentTx.entityValue.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(currentTx.auditEvent.createMany.mock.calls[0][0].data).toHaveLength(2);
    expectConfigurationDelegatesNotTouched(currentTx);
  });

  it("rolls back creates when an update persistence step fails", async () => {
    const currentTx = tx();

    currentTx.entityValue.deleteMany.mockRejectedValueOnce(new Error("delete failed"));
    entityRecordFindMany.mockResolvedValueOnce([
      {
        id: "record_1",
        displayName: "Ana",
        values: [value("field_name", { textValue: "Ana" })],
      },
    ] as never);
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      importEntityRecords({
        contractId: "contract_1",
        entityTypeId: "entity_1",
        file: await workbookFile(2, ["__record_id", "Nombre"], [["record_1", "Ana editada"], ["", "Luis"]]),
        userId: "user_1",
      }),
    ).rejects.toThrow("delete failed");

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(currentTx.entityRecord.createMany).not.toHaveBeenCalled();
  });

  it("rejects missing SELECT labels without falling back to text import", async () => {
    const estadoField = importField({
      id: "field_estado",
      name: "Estado",
      key: "estado",
      type: "SELECT",
      options: [
        { id: "opt_operativo", label: "Operativo", value: "operativo", sortOrder: 1, isActive: true },
      ],
    });
    const currentTx = tx();

    mocks.getAuthorizedRecordEntityType.mockResolvedValue(importContext([estadoField]));
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      importEntityRecords({
        contractId: "contract_1",
        entityTypeId: "entity_1",
        file: await workbookFile(1, ["Estado"], [["Operativo X"]]),
        userId: "user_1",
      }),
    ).rejects.toMatchObject({
      errors: [
        {
          row: 2,
          field: "Estado",
          message: "La opción “Operativo X” no existe para el campo Estado.",
        },
      ],
    });

    expect(transaction).not.toHaveBeenCalled();
    expect(estadoField.type).toBe("SELECT");
    expectConfigurationDelegatesNotTouched(currentTx);
  });

  it("does not swallow transaction failures, preserving all-or-nothing semantics", async () => {
    const currentTx = tx();
    currentTx.auditChange.createMany.mockRejectedValueOnce(new Error("audit failed"));
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      importEntityRecords({
        contractId: "contract_1",
        entityTypeId: "entity_1",
        file: await workbookFile(10),
        userId: "user_1",
      }),
    ).rejects.toThrow("audit failed");

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(currentTx.entityRecord.createMany).toHaveBeenCalled();
    expect(currentTx.auditChange.createMany).toHaveBeenCalled();
  });
});

function expectConfigurationDelegatesNotTouched(currentTx: ReturnType<typeof tx>) {
  expect(currentTx.entityField.update).not.toHaveBeenCalled();
  expect(currentTx.entityField.updateMany).not.toHaveBeenCalled();
  expect(currentTx.entityField.upsert).not.toHaveBeenCalled();
  expect(currentTx.entityType.update).not.toHaveBeenCalled();
  expect(currentTx.entityType.updateMany).not.toHaveBeenCalled();
  expect(currentTx.entityType.upsert).not.toHaveBeenCalled();
  expect(currentTx.fieldOption.create).not.toHaveBeenCalled();
  expect(currentTx.fieldOption.createMany).not.toHaveBeenCalled();
  expect(currentTx.fieldOption.update).not.toHaveBeenCalled();
  expect(currentTx.fieldOption.updateMany).not.toHaveBeenCalled();
  expect(currentTx.fieldOption.upsert).not.toHaveBeenCalled();
}
