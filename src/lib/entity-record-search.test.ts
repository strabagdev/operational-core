import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntityFieldType, Prisma } from "@prisma/client";

import {
  buildEntityRecordSearchWhere,
  getEntityRecords,
  resolveEntityRecordSort,
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
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

const entityTypeFindFirst = vi.mocked(prisma.entityType.findFirst);
const entityRecordCount = vi.mocked(prisma.entityRecord.count);
const entityRecordFindMany = vi.mocked(prisma.entityRecord.findMany);
const queryRaw = vi.mocked(prisma.$queryRaw);

type TestField = ReturnType<typeof baseField>;

beforeEach(() => {
  vi.clearAllMocks();
  entityTypeFindFirst.mockResolvedValue(entityType([textField("name")]) as never);
  entityRecordCount.mockResolvedValue(0);
  entityRecordFindMany.mockResolvedValue([]);
  queryRaw.mockResolvedValue([]);
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

describe("entity record server-side sorting", () => {
  it.each([
    ["displayName", "asc"],
    ["displayName", "desc"],
  ] as const)("sorts by %s %s through Prisma orderBy", async (sortKey, direction) => {
    await getEntityRecords({
      contractId: "contract_1",
      entityTypeId: "entity_1",
      sort: { key: sortKey, direction },
      userId: "user_1",
    });

    expect(entityRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ displayName: direction }, { id: "asc" }],
      }),
    );
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it.each([
    ["updatedAt", "asc"],
    ["updatedAt", "desc"],
  ] as const)("sorts by %s %s through Prisma orderBy", async (sortKey, direction) => {
    await getEntityRecords({
      contractId: "contract_1",
      entityTypeId: "entity_1",
      sort: { key: sortKey, direction },
      userId: "user_1",
    });

    expect(entityRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ updatedAt: direction }, { displayName: "asc" }, { id: "asc" }],
      }),
    );
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("falls back to the default order for invalid sort keys and directions", async () => {
    const data = await getEntityRecords({
      contractId: "contract_1",
      entityTypeId: "entity_1",
      sort: { key: "field:foreign", direction: "drop table" },
      userId: "user_1",
    });

    expect(data?.sort).toBeNull();
    expect(entityRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ updatedAt: "desc" }, { displayName: "asc" }, { id: "asc" }],
      }),
    );
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it.each([
    ["TEXT", "text", "asc"],
    ["TEXTAREA", "textarea", "desc"],
    ["EMAIL", "email", "asc"],
    ["PHONE", "phone", "desc"],
    ["URL", "url", "asc"],
    ["INTEGER", "integer", "desc"],
    ["DECIMAL", "decimal", "asc"],
    ["MONEY", "money", "desc"],
    ["DATE", "date", "asc"],
    ["DATETIME", "datetime", "desc"],
    ["BOOLEAN", "active", "asc"],
    ["SELECT", "status", "asc"],
  ] as const)("sorts %s visible fields DB-side before pagination", async (type, fieldId, direction) => {
    entityTypeFindFirst.mockResolvedValue(entityType([
      textField("name", { config: { display: { primary: true } }, sortOrder: 0 }),
      textField(fieldId, {
        type,
        config: { display: { showInList: true } },
        options: type === "SELECT" ? [
          option("Aprobado", "aprobado"),
          option("Pendiente", "pendiente"),
        ] : [],
      }),
    ]) as never);
    queryRaw.mockResolvedValueOnce([{ id: "record_b" }, { id: "record_a" }]);
    entityRecordFindMany.mockResolvedValueOnce([
      record("record_a"),
      record("record_b"),
    ] as never);

    const data = await getEntityRecords({
      contractId: "contract_1",
      entityTypeId: "entity_1",
      page: 2,
      pageSize: 25,
      query: "juan",
      sort: { key: `field:${fieldId}`, direction },
      userId: "user_1",
    });

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(entityRecordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ["record_b", "record_a"] },
          entityTypeId: "entity_1",
        },
      }),
    );
    expect(data?.records.map((item) => item.id)).toEqual(["record_b", "record_a"]);
    expect(data?.sort).toEqual({ key: `field:${fieldId}`, direction });
    const sql = queryRaw.mock.calls[0]?.[0] as { strings?: string[] };
    expect(sql.strings?.join(" ")).toContain("IS NULL");
  });

  it("does not allow hidden, multiselect, relation, file, image or foreign fields as dynamic sort keys", () => {
    const fields = [
      textField("visible", { config: { display: { showInList: true } } }),
      textField("hidden", { config: { display: { showInList: false } } }),
      textField("multi", { type: "MULTISELECT", config: { display: { showInList: true } } }),
      textField("rel", { type: "RELATION", config: { display: { showInList: true } } }),
      textField("file", { type: "FILE", config: { display: { showInList: true } } }),
      textField("image", { type: "IMAGE", config: { display: { showInList: true } } }),
      textField("foreign", {
        entityTypeId: "entity_2",
        config: { display: { showInList: true } },
      }),
    ];
    const listFields = [fields[0], fields[2], fields[3], fields[4], fields[5]];

    expect(
      resolveEntityRecordSort({
        fields,
        listFields,
        sortKey: "field:visible",
        direction: "asc",
      }).explicit,
    ).toBe(true);
    for (const fieldId of ["hidden", "multi", "rel", "file", "image", "foreign"]) {
      expect(
        resolveEntityRecordSort({
          fields,
          listFields,
          sortKey: `field:${fieldId}`,
          direction: "asc",
        }),
      ).toMatchObject({ key: "updatedAt", explicit: false });
    }
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

function record(id: string) {
  return {
    id,
    displayName: id,
    updatedAt: new Date("2026-01-01"),
    values: [],
  };
}
