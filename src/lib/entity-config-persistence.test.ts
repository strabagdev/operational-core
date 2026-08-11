import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createEntityFieldWithOptions,
  getAuthorizedEntityType,
  updateEntityFieldWithOptions,
} from "./entity-config";
import { prisma } from "./prisma";

vi.mock("./contracts", () => ({
  getAuthorizedContract: vi.fn(async () => ({
    id: "contract_1",
    organizationId: "org_1",
    name: "Contrato",
    code: "CON",
    description: null,
    status: "ACTIVE",
    slug: "contrato",
    organization: { id: "org_1", name: "Org" },
  })),
}));

vi.mock("./prisma", () => ({
  prisma: {
    entityType: {
      findFirst: vi.fn(),
    },
    entityField: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const entityTypeFindFirst = vi.mocked(prisma.entityType.findFirst);
const entityFieldFindFirst = vi.mocked(prisma.entityField.findFirst);
const transaction = vi.mocked(prisma.$transaction);

function field(overrides: Record<string, unknown> = {}) {
  return {
    id: "field_1",
    entityTypeId: "entity_1",
    name: "RUT",
    key: "rut",
    description: null,
    type: "TEXT",
    required: false,
    isUnique: false,
    searchable: false,
    multiple: false,
    sortOrder: 1,
    config: { validation: { required: false, minLength: 2 }, display: { showInList: true } },
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    options: [],
    _count: { values: 0, relations: 0 },
    ...overrides,
  };
}

function input(required: boolean, overrides: Record<string, unknown> = {}) {
  const type = String(overrides.type ?? "TEXT");
  const validation = type === "TEXT" ? { required, minLength: 2 } : { required };

  return {
    name: "RUT",
    key: "rut",
    description: undefined,
    type: "TEXT",
    required,
    isUnique: false,
    searchable: true,
    multiple: false,
    isActive: true,
    validation,
    defaultValue: undefined,
    display: { showInList: true },
    ...overrides,
  } as never;
}

function tx() {
  return {
    entityField: {
      create: vi.fn(async ({ data }) => ({ ...field(), id: "field_created", ...data })),
      update: vi.fn(async ({ data }) => ({ ...field(), ...data })),
    },
    fieldOption: {
      create: vi.fn(async ({ data }) => ({ id: "opt_created", ...data })),
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      deleteMany: vi.fn(),
      delete: vi.fn(),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  entityTypeFindFirst.mockResolvedValue({
    id: "entity_1",
    contractId: "contract_1",
    fields: [field()],
  } as never);
  entityFieldFindFirst.mockResolvedValue({ sortOrder: 0 } as never);
});

describe("entity field required persistence", () => {
  it("persists required false to true when editing", async () => {
    const currentTx = tx();
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await updateEntityFieldWithOptions(
      "contract_1",
      "entity_1",
      "field_1",
      "user_1",
      input(true),
      [],
    );

    expect(currentTx.entityField.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          required: true,
          config: expect.objectContaining({
            validation: expect.objectContaining({ required: true, minLength: 2 }),
            display: expect.objectContaining({ showInList: true }),
          }),
        }),
      }),
    );
  });

  it("persists required true to false when editing", async () => {
    entityTypeFindFirst.mockResolvedValue({
      id: "entity_1",
      contractId: "contract_1",
      fields: [field({ required: true, config: { validation: { required: true, minLength: 2 } } })],
    } as never);
    const currentTx = tx();
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await updateEntityFieldWithOptions(
      "contract_1",
      "entity_1",
      "field_1",
      "user_1",
      input(false),
      [],
    );

    expect(currentTx.entityField.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          required: false,
          config: expect.objectContaining({
            validation: expect.objectContaining({ required: false, minLength: 2 }),
          }),
        }),
      }),
    );
  });
});

describe("entity field option persistence", () => {
  it("loads saved FieldOption rows when reopening the field editor", async () => {
    entityTypeFindFirst.mockResolvedValue({
      id: "entity_1",
      contractId: "contract_1",
      fields: [
        field({
          type: "SELECT",
          options: [
            { id: "opt_activo", label: "Activo", value: "activo", sortOrder: 1, isActive: true },
            { id: "opt_inactivo", label: "Inactivo", value: "inactivo", sortOrder: 2, isActive: true },
            { id: "opt_suspendido", label: "Suspendido", value: "suspendido", sortOrder: 3, isActive: true },
          ],
        }),
      ],
    } as never);

    const result = await getAuthorizedEntityType("contract_1", "entity_1", "user_1");

    expect(result?.entityType.fields[0].options.map((option) => option.label)).toEqual([
      "Activo",
      "Inactivo",
      "Suspendido",
    ]);
    expect(entityTypeFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          fields: expect.objectContaining({
            include: expect.objectContaining({
              options: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
            }),
          }),
        }),
      }),
    );
  });

  it("creates SELECT options in the same transaction as the field", async () => {
    const currentTx = tx();
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await createEntityFieldWithOptions(
      "contract_1",
      "entity_1",
      "user_1",
      input(false, { type: "SELECT", name: "Estado", key: "estado" }),
      [
        { label: "Activo", value: "activo", sortOrder: 1, isActive: true },
        { label: "Inactivo", value: "inactivo", sortOrder: 2, isActive: true },
        { label: "Suspendido", value: "suspendido", sortOrder: 3, isActive: true },
      ],
    );

    expect(currentTx.entityField.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "SELECT" }),
      }),
    );
    expect(currentTx.fieldOption.createMany).toHaveBeenCalledWith({
      data: [
        {
          entityFieldId: "field_created",
          label: "Activo",
          value: "activo",
          sortOrder: 1,
          isActive: true,
        },
        {
          entityFieldId: "field_created",
          label: "Inactivo",
          value: "inactivo",
          sortOrder: 2,
          isActive: true,
        },
        {
          entityFieldId: "field_created",
          label: "Suspendido",
          value: "suspendido",
          sortOrder: 3,
          isActive: true,
        },
      ],
    });
  });

  it("creates MULTISELECT options using the same option path", async () => {
    const currentTx = tx();
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await createEntityFieldWithOptions(
      "contract_1",
      "entity_1",
      "user_1",
      input(false, { type: "MULTISELECT", name: "Estados", key: "estados", multiple: true }),
      [
        { label: "Activo", value: "activo", sortOrder: 1, isActive: true },
        { label: "Suspendido", value: "suspendido", sortOrder: 2, isActive: true },
      ],
    );

    expect(currentTx.fieldOption.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ label: "Activo", value: "activo" }),
          expect.objectContaining({ label: "Suspendido", value: "suspendido" }),
        ]),
      }),
    );
  });

  it("adds new options while preserving existing options on edit", async () => {
    entityTypeFindFirst.mockResolvedValue({
      id: "entity_1",
      contractId: "contract_1",
      fields: [
        field({
          type: "SELECT",
          options: [
            { id: "opt_activo", label: "Activo", value: "activo", sortOrder: 1, isActive: true },
          ],
        }),
      ],
    } as never);
    const currentTx = tx();
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await updateEntityFieldWithOptions(
      "contract_1",
      "entity_1",
      "field_1",
      "user_1",
      input(false, { type: "SELECT", name: "Estado", key: "estado" }),
      [
        { id: "opt_activo", label: "Activo laboral", value: "activo", sortOrder: 1, isActive: true },
        { label: "Inactivo", value: "inactivo", sortOrder: 2, isActive: true },
      ],
    );

    expect(currentTx.fieldOption.update).toHaveBeenCalledWith({
      where: { id: "opt_activo" },
      data: {
        label: "Activo laboral",
        value: "activo",
        sortOrder: 1,
        isActive: true,
      },
    });
    expect(currentTx.fieldOption.create).toHaveBeenCalledWith({
      data: {
        entityFieldId: "field_1",
        label: "Inactivo",
        value: "inactivo",
        sortOrder: 2,
        isActive: true,
      },
    });
    expect(currentTx.fieldOption.deleteMany).not.toHaveBeenCalled();
    expect(currentTx.fieldOption.delete).not.toHaveBeenCalled();
  });

  it("does not delete existing options that are absent from an edit payload", async () => {
    entityTypeFindFirst.mockResolvedValue({
      id: "entity_1",
      contractId: "contract_1",
      fields: [
        field({
          type: "SELECT",
          options: [
            { id: "opt_activo", label: "Activo", value: "activo", sortOrder: 1, isActive: true },
            { id: "opt_inactivo", label: "Inactivo", value: "inactivo", sortOrder: 2, isActive: true },
          ],
        }),
      ],
    } as never);
    const currentTx = tx();
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await updateEntityFieldWithOptions(
      "contract_1",
      "entity_1",
      "field_1",
      "user_1",
      input(false, { type: "SELECT", name: "Estado", key: "estado" }),
      [
        { id: "opt_activo", label: "Activo", value: "activo", sortOrder: 1, isActive: true },
      ],
    );

    expect(currentTx.fieldOption.deleteMany).not.toHaveBeenCalled();
    expect(currentTx.fieldOption.delete).not.toHaveBeenCalled();
  });

  it("persists option reorder and deactivation on edit", async () => {
    entityTypeFindFirst.mockResolvedValue({
      id: "entity_1",
      contractId: "contract_1",
      fields: [
        field({
          type: "SELECT",
          options: [
            { id: "opt_activo", label: "Activo", value: "activo", sortOrder: 1, isActive: true },
            { id: "opt_inactivo", label: "Inactivo", value: "inactivo", sortOrder: 2, isActive: true },
          ],
        }),
      ],
    } as never);
    const currentTx = tx();
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await updateEntityFieldWithOptions(
      "contract_1",
      "entity_1",
      "field_1",
      "user_1",
      input(false, { type: "SELECT", name: "Estado", key: "estado" }),
      [
        { id: "opt_inactivo", label: "Inactivo", value: "inactivo", sortOrder: 1, isActive: false },
        { id: "opt_activo", label: "Activo", value: "activo", sortOrder: 2, isActive: true },
      ],
    );

    expect(currentTx.fieldOption.update).toHaveBeenCalledWith({
      where: { id: "opt_inactivo" },
      data: {
        label: "Inactivo",
        value: "inactivo",
        sortOrder: 1,
        isActive: false,
      },
    });
    expect(currentTx.fieldOption.update).toHaveBeenCalledWith({
      where: { id: "opt_activo" },
      data: {
        label: "Activo",
        value: "activo",
        sortOrder: 2,
        isActive: true,
      },
    });
  });

  it("rolls back the field update when creating an option fails inside the transaction", async () => {
    entityTypeFindFirst.mockResolvedValue({
      id: "entity_1",
      contractId: "contract_1",
      fields: [field({ type: "SELECT", options: [] })],
    } as never);
    const currentTx = tx();
    currentTx.fieldOption.create.mockRejectedValueOnce(new Error("option failed"));
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      updateEntityFieldWithOptions(
        "contract_1",
        "entity_1",
        "field_1",
        "user_1",
        input(false, { type: "SELECT", name: "Estado", key: "estado" }),
        [{ label: "Activo", value: "activo", sortOrder: 1, isActive: true }],
      ),
    ).rejects.toThrow("option failed");
    expect(currentTx.entityField.update).toHaveBeenCalled();
    expect(transaction).toHaveBeenCalled();
  });
});
