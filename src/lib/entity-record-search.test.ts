import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntityFieldType, Prisma } from "@prisma/client";

import { buildEntityRecordSearchWhere, getEntityRecords } from "./entity-records";
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
      findMany: vi.fn(),
    },
  },
}));

const entityTypeFindFirst = vi.mocked(prisma.entityType.findFirst);
const entityRecordCount = vi.mocked(prisma.entityRecord.count);
const entityRecordFindMany = vi.mocked(prisma.entityRecord.findMany);

type TestField = ReturnType<typeof baseField>;

beforeEach(() => {
  vi.clearAllMocks();
  entityTypeFindFirst.mockResolvedValue(entityType([textField("name")]) as never);
  entityRecordCount.mockResolvedValue(0);
  entityRecordFindMany.mockResolvedValue([]);
});

describe("entity record server-side search", () => {
  it("searches displayName case-insensitively", () => {
    expect(searchWhere([textField("name")])).toMatchObject({
      entityTypeId: "entity_1",
      OR: expect.arrayContaining([
        {
          displayName: {
            contains: "Persona 10",
            mode: "insensitive",
          },
        },
      ]),
    });
  });

  it("searches only searchable text-like EntityValue fields", () => {
    expect(
      searchWhere([
        textField("text"),
        textField("textarea", { type: "TEXTAREA" }),
        textField("email", { type: "EMAIL" }),
        textField("phone", { type: "PHONE" }),
        textField("url", { type: "URL" }),
        textField("hidden", { searchable: false }),
        textField("number", { type: "INTEGER" }),
      ]),
    ).toMatchObject({
      OR: expect.arrayContaining([
        {
          values: {
            some: {
              entityFieldId: {
                in: ["text", "textarea", "email", "phone", "url"],
              },
              textValue: {
                contains: "Persona 10",
                mode: "insensitive",
              },
            },
          },
        },
      ]),
    });
  });

  it("does not let fields from another entity type participate in search", () => {
    expect(
      searchWhere([
        textField("own"),
        textField("foreign", { entityTypeId: "entity_2" }),
      ]),
    ).toMatchObject({
      OR: expect.arrayContaining([
        {
          values: {
            some: {
              entityFieldId: { in: ["own"] },
              textValue: {
                contains: "Persona 10",
                mode: "insensitive",
              },
            },
          },
        },
      ]),
    });
  });

  it("adds SELECT searches by matching visible labels to stored values", () => {
    expect(
      searchWhere([
        textField("status", {
          type: "SELECT",
          options: [
            option("Operativo", "op"),
            option("Retirado", "ret"),
          ],
        }),
      ], "operativo"),
    ).toMatchObject({
      OR: expect.arrayContaining([
        {
          values: {
            some: {
              entityFieldId: "status",
              textValue: { in: ["op"] },
            },
          },
        },
      ]),
    });
  });

  it("builds search without technical status filters", () => {
    expect(searchWhere([textField("name")], "persona")).toMatchObject({
      entityTypeId: "entity_1",
      OR: expect.any(Array),
    });
    expect(searchWhere([textField("name")], "persona")).not.toHaveProperty("status");
  });

  it("uses count and DB pagination for active searches", async () => {
    entityTypeFindFirst.mockResolvedValue(entityType([
      textField("name", { config: { display: { primary: true } }, sortOrder: 0 }),
      textField("rut", { config: { display: { showInList: true } }, sortOrder: 1 }),
      textField("notes", { searchable: true, sortOrder: 2 }),
    ]) as never);
    entityRecordCount.mockResolvedValue(23);
    entityRecordFindMany.mockResolvedValue([
      {
        id: "record_1",
        displayName: "Persona 10",
        updatedAt: new Date("2026-01-01"),
        values: [],
      },
    ] as never);

    await expect(
      getEntityRecords({
        contractId: "contract_1",
        entityTypeId: "entity_1",
        page: 3,
        pageSize: 25,
        query: "persona 10",
        userId: "user_1",
      }),
    ).resolves.toMatchObject({
      pagination: {
        page: 3,
        pageSize: 25,
        totalRecords: 23,
        totalPages: 1,
      },
      records: [{ id: "record_1" }],
    });
    expect(entityRecordCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        entityTypeId: "entity_1",
        OR: expect.any(Array),
      }),
    });
    expect(entityRecordFindMany.mock.calls[0]?.[0]?.where).toEqual(
      entityRecordCount.mock.calls[0]?.[0]?.where,
    );
    expect(entityRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 50,
        take: 25,
        include: {
          values: expect.objectContaining({
            where: { entityFieldId: { in: ["rut"] } },
          }),
        },
      }),
    );
  });

  it("does not load audit history in normal record listings", async () => {
    await getEntityRecords({
      contractId: "contract_1",
      entityTypeId: "entity_1",
      userId: "user_1",
    });

    expect(entityRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.not.objectContaining({
          auditEvents: expect.anything(),
        }),
      }),
    );
  });

  it("reports zero results from the server-side count", async () => {
    const data = await getEntityRecords({
      contractId: "contract_1",
      entityTypeId: "entity_1",
      query: "sin resultados",
      userId: "user_1",
    });

    expect(data?.pagination).toMatchObject({
      totalRecords: 0,
      totalPages: 1,
    });
    expect(data?.records).toEqual([]);
  });
});

function searchWhere(
  fields: TestField[],
  query = "Persona 10",
) {
  return buildEntityRecordSearchWhere({
    entityTypeId: "entity_1",
    fields,
    query,
  });
}

function entityType(fields: TestField[]) {
  return {
    id: "entity_1",
    contractId: "contract_1",
    name: "Personas",
    slug: "personas",
    description: null,
    icon: null,
    isActive: true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    fields,
  };
}

function textField(
  id: string,
  overrides: Partial<TestField> = {},
) {
  return {
    ...baseField(id),
    ...overrides,
  };
}

function baseField(id: string): {
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
} {
  return {
    id,
    entityTypeId: "entity_1",
    name: id,
    key: id,
    description: null,
    type: "TEXT" as EntityFieldType,
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
}

function option(label: string, value: string) {
  return {
    id: value,
    label,
    value,
    sortOrder: 0,
    isActive: true,
  };
}
