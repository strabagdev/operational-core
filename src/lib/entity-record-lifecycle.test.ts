import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntityFieldType, Prisma } from "@prisma/client";

import {
  buildEntityRecordSearchWhere,
  createEntityRecord,
  getEntityRecords,
  getIncomingRecordRelationGroups,
  getIncomingRecordRelationsPage,
  getRelationOptions,
  updateEntityRecord,
  validateRelationValues,
} from "./entity-records";
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
    entityRecord: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    entityRelation: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

const entityTypeFindFirst = vi.mocked(prisma.entityType.findFirst);
const entityRecordCount = vi.mocked(prisma.entityRecord.count);
const entityRecordFindFirst = vi.mocked(prisma.entityRecord.findFirst);
const entityRecordFindMany = vi.mocked(prisma.entityRecord.findMany);
const queryRaw = vi.mocked(prisma.$queryRaw);
const transaction = vi.mocked(prisma.$transaction);
type TestField = ReturnType<typeof field>;

beforeEach(() => {
  vi.clearAllMocks();
  entityTypeFindFirst.mockResolvedValue(entityType([field("name")]) as never);
  entityRecordCount.mockResolvedValue(0);
  entityRecordFindFirst.mockResolvedValue(null);
  entityRecordFindMany.mockResolvedValue([]);
  queryRaw.mockResolvedValue([] as never);
});

describe("entity records without technical status", () => {
  it("creates EntityRecord without status or archive data", async () => {
    const currentTx = tx();
    currentTx.entityRecord.create.mockResolvedValue({ id: "record_1", displayName: "Registro sin nombre" });
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await expect(
      createEntityRecord("contract_1", "entity_1", "user_1", new FormData()),
    ).resolves.toMatchObject({ id: "record_1" });

    expect(currentTx.entityRecord.create).toHaveBeenCalledWith({
      data: {
        entityTypeId: "entity_1",
        displayName: "Registro sin nombre",
      },
    });
  });

  it("lists all existing records without a status where clause", async () => {
    entityRecordCount.mockResolvedValue(2);
    entityRecordFindMany.mockResolvedValue([
      record("record_1"),
      record("record_2"),
    ] as never);

    await expect(
      getEntityRecords({
        contractId: "contract_1",
        entityTypeId: "entity_1",
        userId: "user_1",
      }),
    ).resolves.toMatchObject({
      pagination: { totalRecords: 2 },
      records: [{ id: "record_1" }, { id: "record_2" }],
    });
    const countArgs = entityRecordCount.mock.calls[0]?.[0];
    const findManyArgs = entityRecordFindMany.mock.calls[0]?.[0];

    expect(countArgs?.where).not.toHaveProperty("status");
    expect(findManyArgs?.where).not.toHaveProperty("status");
  });

  it("searches and paginates without a status filter", () => {
    const where = buildEntityRecordSearchWhere({
      entityTypeId: "entity_1",
      fields: [field("name")],
      query: "persona",
    });

    expect(where).toMatchObject({ entityTypeId: "entity_1", OR: expect.any(Array) });
    expect(where).not.toHaveProperty("status");
  });

  it("shows relation options for any existing target record", async () => {
    const relationField = field("owner", {
      type: "RELATION",
      config: {
        targetEntityTypeId: "target_entity",
        relationKind: "ONE",
      },
    });

    entityTypeFindFirst.mockResolvedValue(entityType([relationField]) as never);
    entityRecordFindMany.mockResolvedValue([
      {
        id: "target_1",
        displayName: "Antiguo archivado",
        entityType: { name: "Personas" },
      },
    ] as never);

    await expect(
      getRelationOptions("contract_1", "entity_1", "user_1"),
    ).resolves.toEqual({
      owner: [
        {
          id: "target_1",
          displayName: "Antiguo archivado",
          entityTypeName: "Personas",
        },
      ],
    });
    const findManyArgs = entityRecordFindMany.mock.calls[0]?.[0];

    expect(findManyArgs?.where).not.toHaveProperty("status");
  });

  it("loads target display names for relation fields shown in record lists", async () => {
    const relationField = field("department", {
      type: "RELATION",
      config: {
        display: { showInList: true },
        targetEntityTypeId: "target_entity",
        relationKind: "ONE",
      },
    });

    entityTypeFindFirst.mockResolvedValue(entityType([field("name"), relationField]) as never);
    entityRecordCount.mockResolvedValue(1);
    entityRecordFindMany.mockResolvedValue([
      {
        id: "source_record_1",
        displayName: "Source",
        values: [],
        outgoingRelations: [
          {
            sourceFieldId: "department",
            targetRecord: {
              displayName: "Departamentos",
              entityTypeId: "target_entity",
              id: "target_record_1",
            },
            targetRecordId: "target_record_1",
          },
        ],
      },
    ] as never);

    await expect(
      getEntityRecords({
        contractId: "contract_1",
        entityTypeId: "entity_1",
        userId: "user_1",
      }),
    ).resolves.toMatchObject({
      records: [
        {
          outgoingRelations: [
            {
              sourceFieldId: "department",
              targetRecord: {
                displayName: "Departamentos",
                id: "target_record_1",
              },
              targetRecordId: "target_record_1",
            },
          ],
        },
      ],
    });
    expect(entityRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          outgoingRelations: expect.objectContaining({
            include: {
              targetRecord: {
                select: {
                  displayName: true,
                  entityTypeId: true,
                  id: true,
                },
              },
            },
            where: { sourceFieldId: { in: ["department"] } },
          }),
        }),
      }),
    );
  });

  it("rejects relation target records outside the configured entity type or contract", async () => {
    const relationField = field("owner", {
      type: "RELATION",
      config: {
        targetEntityTypeId: "target_entity",
        relationKind: "ONE",
      },
    });
    const formData = new FormData();
    formData.append("field_owner", "foreign_record");
    entityRecordCount.mockResolvedValueOnce(0);

    await expect(
      validateRelationValues({
        contractId: "contract_1",
        entityTypeId: "entity_1",
        fields: [relationField],
        formData,
      }),
    ).rejects.toThrow("owner contiene registros relacionados no válidos.");

    expect(entityRecordCount).toHaveBeenCalledWith({
      where: {
        id: { in: ["foreign_record"] },
        entityType: {
          id: "target_entity",
          contractId: "contract_1",
        },
      },
    });
  });

  it.each(["MASTER", "TRANSACTION", "REFERENCE"] as const)(
    "creates a single EntityRelation to a %s target with the selected targetRecordId",
    async (targetNature) => {
      const relationField = field("department", {
        type: "RELATION",
        config: {
          targetEntityTypeId: "target_entity",
          relationKind: "ONE",
        },
      });
      const formData = new FormData();
      const currentTx = tx();

      formData.append("field_department", "target_record_1");
      entityTypeFindFirst.mockResolvedValue(entityType([field("name"), relationField]) as never);
      entityRecordCount.mockResolvedValueOnce(1);
      currentTx.entityRecord.create.mockResolvedValue({
        id: "source_record_1",
        displayName: "Registro sin nombre",
      });
      transaction.mockImplementation(async (callback) => callback(currentTx as never));

      await expect(
        createEntityRecord("contract_1", "entity_1", "user_1", formData),
      ).resolves.toMatchObject({ id: "source_record_1" });

      expect(entityRecordCount).toHaveBeenCalledWith({
        where: {
          id: { in: ["target_record_1"] },
          entityType: {
            id: "target_entity",
            contractId: "contract_1",
          },
        },
      });
      const relationTargetWhere = entityRecordCount.mock.calls[0]?.[0]?.where;

      expect(relationTargetWhere).not.toHaveProperty("nature");
      expect(relationTargetWhere?.entityType).not.toHaveProperty("nature");
      expect(currentTx.entityRelation.createMany).toHaveBeenCalledWith({
        data: [
          {
            sourceRecordId: "source_record_1",
            sourceFieldId: "department",
            targetRecordId: "target_record_1",
          },
        ],
        skipDuplicates: true,
      });
      expect(["MASTER", "TRANSACTION", "REFERENCE"]).toContain(targetNature);
    },
  );

  it("updates a single relation to a REFERENCE target", async () => {
    const relationField = field("department", {
      type: "RELATION",
      config: {
        targetEntityTypeId: "target_entity",
        relationKind: "ONE",
      },
    });
    const formData = new FormData();
    const currentTx = tx();

    formData.append("field_department", "target_record_2");
    entityTypeFindFirst.mockResolvedValue(entityType([field("name"), relationField]) as never);
    entityRecordFindFirst.mockResolvedValue({
      id: "source_record_1",
      displayName: "Source",
      values: [],
      outgoingRelations: [
        {
          sourceFieldId: "department",
          targetRecordId: "target_record_1",
        },
      ],
    } as never);
    entityRecordCount.mockResolvedValueOnce(1);
    currentTx.entityRecord.update.mockResolvedValue({ id: "source_record_1", displayName: "Source" });
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await updateEntityRecord("contract_1", "entity_1", "source_record_1", "user_1", formData);

    expect(currentTx.entityRelation.deleteMany).toHaveBeenCalledWith({
      where: {
        sourceRecordId: "source_record_1",
        sourceFieldId: "department",
        targetRecordId: { notIn: ["target_record_2"] },
      },
    });
    expect(currentTx.entityRelation.createMany).toHaveBeenCalledWith({
      data: [
        {
          sourceRecordId: "source_record_1",
          sourceFieldId: "department",
          targetRecordId: "target_record_2",
        },
      ],
      skipDuplicates: true,
    });
  });

  it("clears an optional relation when no targetRecordId is submitted", async () => {
    const relationField = field("department", {
      type: "RELATION",
      config: {
        targetEntityTypeId: "target_entity",
        relationKind: "ONE",
      },
    });
    const currentTx = tx();

    entityTypeFindFirst.mockResolvedValue(entityType([field("name"), relationField]) as never);
    entityRecordFindFirst.mockResolvedValue({
      id: "source_record_1",
      displayName: "Source",
      values: [],
      outgoingRelations: [
        {
          sourceFieldId: "department",
          targetRecordId: "target_record_1",
        },
      ],
    } as never);
    currentTx.entityRecord.update.mockResolvedValue({ id: "source_record_1", displayName: "Source" });
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await updateEntityRecord("contract_1", "entity_1", "source_record_1", "user_1", new FormData());

    expect(currentTx.entityRelation.deleteMany).toHaveBeenCalledWith({
      where: {
        sourceRecordId: "source_record_1",
        sourceFieldId: "department",
        targetRecordId: { notIn: [] },
      },
    });
    expect(currentTx.entityRelation.createMany).not.toHaveBeenCalled();
  });

  it("creates one EntityRelation per selected target for a multiple REFERENCE relation", async () => {
    const relationField = field("departments", {
      type: "RELATION",
      multiple: true,
      config: {
        targetEntityTypeId: "target_entity",
        relationKind: "MANY",
      },
    });
    const formData = new FormData();
    const currentTx = tx();

    formData.append("field_departments", "target_record_1");
    formData.append("field_departments", "target_record_2");
    entityTypeFindFirst.mockResolvedValue(entityType([field("name"), relationField]) as never);
    entityRecordCount.mockResolvedValueOnce(2);
    currentTx.entityRecord.create.mockResolvedValue({
      id: "source_record_1",
      displayName: "Registro sin nombre",
    });
    transaction.mockImplementation(async (callback) => callback(currentTx as never));

    await createEntityRecord("contract_1", "entity_1", "user_1", formData);

    expect(currentTx.entityRelation.createMany).toHaveBeenCalledWith({
      data: [
        {
          sourceRecordId: "source_record_1",
          sourceFieldId: "departments",
          targetRecordId: "target_record_1",
        },
        {
          sourceRecordId: "source_record_1",
          sourceFieldId: "departments",
          targetRecordId: "target_record_2",
        },
      ],
      skipDuplicates: true,
    });
  });
});

describe("incoming record relation summaries", () => {
  it("returns no groups when a record has no incoming relations", async () => {
    mockAuthorizedRecord();
    queryRaw.mockResolvedValueOnce([] as never);

    await expect(
      getIncomingRecordRelationGroups(
        "contract_1",
        "entity_1",
        "target_record",
        "user_1",
      ),
    ).resolves.toEqual([]);

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("groups incoming relations by source entity type and field with three previews", async () => {
    mockAuthorizedRecord();
    queryRaw
      .mockResolvedValueOnce([
        {
          sourceEntityTypeId: "people",
          sourceEntityTypeName: "Personas",
          sourceFieldId: "department",
          sourceFieldName: "Departamento",
          total: BigInt(148),
        },
        {
          sourceEntityTypeId: "people",
          sourceEntityTypeName: "Personas",
          sourceFieldId: "manager_department",
          sourceFieldName: "Departamento jefe",
          total: BigInt(2),
        },
        {
          sourceEntityTypeId: "teams",
          sourceEntityTypeName: "Equipos",
          sourceFieldId: "team_department",
          sourceFieldName: "Departamento",
          total: BigInt(12),
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          sourceEntityTypeId: "people",
          sourceFieldId: "department",
          recordId: "person_1",
          displayName: "Ana",
        },
        {
          sourceEntityTypeId: "people",
          sourceFieldId: "department",
          recordId: "person_2",
          displayName: "Beto",
        },
        {
          sourceEntityTypeId: "people",
          sourceFieldId: "department",
          recordId: "person_3",
          displayName: "Carla",
        },
        {
          sourceEntityTypeId: "people",
          sourceFieldId: "manager_department",
          recordId: "person_4",
          displayName: "Diego",
        },
        {
          sourceEntityTypeId: "teams",
          sourceFieldId: "team_department",
          recordId: "team_1",
          displayName: "Equipo Norte",
        },
      ] as never);

    await expect(
      getIncomingRecordRelationGroups(
        "contract_1",
        "entity_1",
        "target_record",
        "user_1",
      ),
    ).resolves.toEqual([
      {
        sourceEntityTypeId: "people",
        sourceEntityTypeName: "Personas",
        sourceFieldId: "department",
        sourceFieldName: "Departamento",
        total: 148,
        preview: [
          { recordId: "person_1", displayName: "Ana" },
          { recordId: "person_2", displayName: "Beto" },
          { recordId: "person_3", displayName: "Carla" },
        ],
      },
      {
        sourceEntityTypeId: "people",
        sourceEntityTypeName: "Personas",
        sourceFieldId: "manager_department",
        sourceFieldName: "Departamento jefe",
        total: 2,
        preview: [{ recordId: "person_4", displayName: "Diego" }],
      },
      {
        sourceEntityTypeId: "teams",
        sourceEntityTypeName: "Equipos",
        sourceFieldId: "team_department",
        sourceFieldName: "Departamento",
        total: 12,
        preview: [{ recordId: "team_1", displayName: "Equipo Norte" }],
      },
    ]);
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it("loads a paginated incoming relation page scoped to the contract", async () => {
    mockAuthorizedRecord();
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType([field("name")]) as never)
      .mockResolvedValueOnce({
        id: "people",
        name: "Personas",
        fields: [{ id: "department", name: "Departamento" }],
      } as never);
    entityRecordCount.mockResolvedValue(501);
    entityRecordFindMany.mockResolvedValue([
      { id: "person_26", displayName: "Persona 26" },
    ] as never);

    const data = await getIncomingRecordRelationsPage({
      contractId: "contract_1",
      entityTypeId: "entity_1",
      recordId: "target_record",
      sourceEntityTypeId: "people",
      sourceFieldId: "department",
      userId: "user_1",
      page: 2,
      pageSize: 25,
      query: "persona",
    });

    expect(data).toMatchObject({
      pagination: {
        page: 2,
        pageSize: 25,
        totalRecords: 501,
        totalPages: 21,
      },
      records: [{ id: "person_26", displayName: "Persona 26" }],
    });
    expect(entityRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 25,
        take: 25,
        where: expect.objectContaining({
          entityTypeId: "people",
          displayName: {
            contains: "persona",
            mode: "insensitive",
          },
          outgoingRelations: {
            some: {
              sourceFieldId: "department",
              targetRecordId: "target_record",
              targetRecord: {
                entityTypeId: "entity_1",
                entityType: {
                  contractId: "contract_1",
                },
              },
            },
          },
        }),
      }),
    );
  });

  it("rejects relation pages for source entity types outside the contract", async () => {
    mockAuthorizedRecord();
    entityTypeFindFirst
      .mockResolvedValueOnce(entityType([field("name")]) as never)
      .mockResolvedValueOnce(null);

    await expect(
      getIncomingRecordRelationsPage({
        contractId: "contract_1",
        entityTypeId: "entity_1",
        recordId: "target_record",
        sourceEntityTypeId: "other_contract_people",
        sourceFieldId: "department",
        userId: "user_1",
      }),
    ).resolves.toBeNull();
    expect(entityRecordFindMany).not.toHaveBeenCalled();
  });
});

function tx() {
  return {
    entityRecord: {
      create: vi.fn(),
      update: vi.fn(),
    },
    entityValue: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    entityRelation: {
      deleteMany: vi.fn(),
      findMany: vi.fn(async () => []),
      createMany: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
  };
}

function mockAuthorizedRecord() {
  entityTypeFindFirst.mockResolvedValue(entityType([field("name")]) as never);
  entityRecordFindFirst.mockResolvedValue({
    id: "target_record",
    displayName: "Departamento Norte",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
    values: [],
    outgoingRelations: [],
  } as never);
}

function entityType(fields: TestField[]) {
  return {
    id: "entity_1",
    contractId: "contract_1",
    name: "Personas",
    fields,
  };
}

function record(id: string) {
  return {
    id,
    displayName: id,
    updatedAt: new Date("2026-01-01"),
    values: [],
  };
}

function field(id: string, overrides: Record<string, unknown> = {}) {
  const base: {
    id: string;
    entityTypeId: string;
    name: string;
    key: string;
    description: string | null;
    type: EntityFieldType;
    required: boolean;
    isUnique: boolean;
    searchable: boolean;
    multiple: boolean;
    sortOrder: number;
    config: Prisma.JsonValue | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    options: Array<{
      id: string;
      label: string;
      value: string;
      sortOrder: number;
      isActive: boolean;
    }>;
  } = {
    id,
    entityTypeId: "entity_1",
    name: id,
    key: id,
    description: null,
    type: "TEXT",
    required: false,
    isUnique: false,
    searchable: true,
    multiple: false,
    sortOrder: 0,
    config: null,
    isActive: true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    options: [],
  };

  return {
    ...base,
    ...overrides,
  };
}
