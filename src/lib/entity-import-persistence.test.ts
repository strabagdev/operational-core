import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { importEntityRecords } from "./entity-import";
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
  },
}));

const transaction = vi.mocked(prisma.$transaction);

function importField(overrides: Record<string, unknown> = {}) {
  return {
    id: String(overrides.id ?? "field_name"),
    entityTypeId: "entity_1",
    name: String(overrides.name ?? "Nombre"),
    key: String(overrides.key ?? "nombre"),
    description: null,
    type: overrides.type ?? "TEXT",
    required: Boolean(overrides.required ?? true),
    isUnique: false,
    searchable: false,
    multiple: false,
    sortOrder: 1,
    config: null,
    isActive: true,
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
    entityValue: {
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthorizedRecordEntityType.mockResolvedValue(importContext());
});

describe("entity import persistence", () => {
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
    ).resolves.toEqual({ importedCount: 414 });

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
    ).resolves.toEqual({ importedCount: 3 });

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
    ).resolves.toEqual({ importedCount: 1 });

    expect(estadoField.type).toBe("MULTISELECT");
    expect(currentTx.entityValue.createMany.mock.calls[0][0].data[0]).toMatchObject({
      entityFieldId: "field_estado",
      jsonValue: ["operativo", "mantencion"],
    });
    expectConfigurationDelegatesNotTouched(currentTx);
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
