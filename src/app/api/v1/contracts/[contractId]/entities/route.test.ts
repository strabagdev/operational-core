import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { signApiAccessToken } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { GET as entityDefinitionGET } from "./[entityTypeId]/route";
import {
  GET as recordDetailGET,
  PATCH as recordDetailPATCH,
} from "./[entityTypeId]/records/[recordId]/route";
import {
  GET as recordsGET,
  POST as recordsPOST,
} from "./[entityTypeId]/records/route";
import { GET as entitiesGET } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    apiIdempotencyKey: {
      create: vi.fn(),
      update: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
    contract: {
      findFirst: vi.fn(),
    },
    entityField: {
      findMany: vi.fn(),
    },
    entityRecord: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    entityRelation: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    entityValue: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
    },
    entityType: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    externalApp: {
      findUnique: vi.fn(),
    },
    membership: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

const transaction = vi.mocked(prisma.$transaction);
const apiIdempotencyKeyCreate = vi.mocked(prisma.apiIdempotencyKey.create);
const apiIdempotencyKeyUpdate = vi.mocked(prisma.apiIdempotencyKey.update);
const auditEventCreate = vi.mocked(prisma.auditEvent.create);
const contractFindFirst = vi.mocked(prisma.contract.findFirst);
const entityFieldFindMany = vi.mocked(prisma.entityField.findMany);
const entityRecordCount = vi.mocked(prisma.entityRecord.count);
const entityRecordCreate = vi.mocked(prisma.entityRecord.create);
const entityRecordFindFirst = vi.mocked(prisma.entityRecord.findFirst);
const entityRecordFindMany = vi.mocked(prisma.entityRecord.findMany);
const entityRecordUpdate = vi.mocked(prisma.entityRecord.update);
const entityRelationCreateMany = vi.mocked(prisma.entityRelation.createMany);
const entityRelationDeleteMany = vi.mocked(prisma.entityRelation.deleteMany);
const entityRelationFindMany = vi.mocked(prisma.entityRelation.findMany);
const entityValueCreateMany = vi.mocked(prisma.entityValue.createMany);
const entityValueDeleteMany = vi.mocked(prisma.entityValue.deleteMany);
const entityValueFindFirst = vi.mocked(prisma.entityValue.findFirst);
const entityTypeFindFirst = vi.mocked(prisma.entityType.findFirst);
const entityTypeFindMany = vi.mocked(prisma.entityType.findMany);
const externalAppFindUnique = vi.mocked(prisma.externalApp.findUnique);
const membershipFindMany = vi.mocked(prisma.membership.findMany);
const membershipFindUnique = vi.mocked(prisma.membership.findUnique);
const userFindUnique = vi.mocked(prisma.user.findUnique);

const app = {
  clientId: "opco_app_client_1",
  id: "app_1",
  name: "Bodega",
  slug: "bodega",
};
const recordUpdatedAt = new Date("2026-08-19T18:32:10.123Z");
const recordUpdatedAtIso = recordUpdatedAt.toISOString();
const laterRecordUpdatedAt = new Date("2026-08-19T18:33:10.123Z");
const laterRecordUpdatedAtIso = laterRecordUpdatedAt.toISOString();

async function apiRequest(path: string, userId = "user_1") {
  const token = await signApiAccessToken({
    app,
    user: {
      email: "user@example.com",
      id: userId,
      name: "User One",
    },
  });

  return new Request(`http://localhost${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

function contract() {
  return {
    id: "contract_1",
    name: "Contrato",
    organization: {
      id: "org_1",
      name: "Organizacion",
    },
    organizationId: "org_1",
  };
}

function field(overrides: Record<string, unknown> = {}) {
  return {
    config: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    description: null,
    entityTypeId: "entity_1",
    id: String(overrides.id ?? "field_codigo"),
    isActive: overrides.isActive ?? true,
    isUnique: false,
    key: String(overrides.key ?? "codigo"),
    multiple: false,
    name: String(overrides.name ?? "Código"),
    options: [],
    required: false,
    searchable: false,
    sortOrder: Number(overrides.sortOrder ?? 1),
    type: overrides.type ?? "TEXT",
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  } as never;
}

function entity(overrides: Record<string, unknown> = {}) {
  return {
    fields: [field()],
    icon: null,
    id: "entity_1",
    isActive: true,
    name: "Equipos",
    nature: "MASTER",
    slug: "equipos",
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.API_AUTH_SECRET = "test-api-auth-secret";
  transaction.mockImplementation((async (
    callback: (tx: typeof prisma) => Promise<unknown>,
  ) => callback(prisma)) as never);
  apiIdempotencyKeyCreate.mockResolvedValue({ id: "idem_1" } as never);
  apiIdempotencyKeyUpdate.mockResolvedValue({ id: "idem_1" } as never);
  auditEventCreate.mockResolvedValue({ id: "audit_1" } as never);
  userFindUnique.mockResolvedValue({
    email: "user@example.com",
    id: "user_1",
    name: "User One",
  } as never);
  membershipFindMany.mockResolvedValue([{ organizationId: "org_1" }] as never);
  externalAppFindUnique.mockResolvedValue({
    active: true,
    clientId: app.clientId,
    id: app.id,
    name: app.name,
    organizationId: "org_1",
    slug: app.slug,
  } as never);
  contractFindFirst.mockResolvedValue(contract() as never);
  entityFieldFindMany.mockResolvedValue([] as never);
  entityRecordCreate.mockResolvedValue({ displayName: "EQ-001", id: "record_1", updatedAt: recordUpdatedAt } as never);
  entityRecordUpdate.mockResolvedValue({ displayName: "EQ-001", id: "record_1", updatedAt: laterRecordUpdatedAt } as never);
  entityRelationCreateMany.mockResolvedValue({ count: 0 } as never);
  entityRelationDeleteMany.mockResolvedValue({ count: 0 } as never);
  entityRelationFindMany.mockResolvedValue([] as never);
  entityValueCreateMany.mockResolvedValue({ count: 1 } as never);
  entityValueDeleteMany.mockResolvedValue({ count: 1 } as never);
  entityValueFindFirst.mockResolvedValue(null);
  membershipFindUnique.mockResolvedValue({ role: "ADMIN" } as never);
});

describe("GET /api/v1/contracts/[contractId]/entities", () => {
  it("lists active entities for an authorized contract", async () => {
    entityTypeFindMany.mockResolvedValue([
      { icon: "warehouse", id: "entity_1", isActive: true, name: "Equipos", nature: "REFERENCE", slug: "equipos" },
    ] as never);

    const response = await entitiesGET(await apiRequest("/api/v1/contracts/contract_1/entities"), {
      params: Promise.resolve({ contractId: "contract_1" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        entities: [
          { active: true, icon: "warehouse", id: "entity_1", name: "Equipos", nature: "REFERENCE", slug: "equipos" },
        ],
      },
    });
    expect(entityTypeFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { contractId: "contract_1", isActive: true },
    }));
  });

  it("rejects a contract from another organization", async () => {
    membershipFindUnique.mockResolvedValue(null);

    const response = await entitiesGET(await apiRequest("/api/v1/contracts/contract_1/entities"), {
      params: Promise.resolve({ contractId: "contract_1" }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "CONTRACT_FORBIDDEN" },
      ok: false,
    });
    expect(entityTypeFindMany).not.toHaveBeenCalled();
  });

  it("rejects an inactive external app", async () => {
    externalAppFindUnique.mockResolvedValueOnce({
      active: false,
      clientId: app.clientId,
      id: app.id,
      name: app.name,
      organizationId: "org_1",
      slug: app.slug,
    } as never);

    const response = await entitiesGET(await apiRequest("/api/v1/contracts/contract_1/entities"), {
      params: Promise.resolve({ contractId: "contract_1" }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "TOKEN_APP_INACTIVE" },
      ok: false,
    });
  });
});

describe("GET /api/v1/contracts/[contractId]/entities/[entityTypeId]", () => {
  it("returns an entity definition with active fields, options and relation metadata", async () => {
    entityTypeFindFirst.mockResolvedValue(entity({
      fields: [
        field({ id: "inactive", isActive: false, key: "inactivo" }),
        field({
          id: "status",
          key: "estado",
          options: [
            { id: "opt_1", isActive: true, label: "Activo", sortOrder: 1, value: "activo" },
          ],
          sortOrder: 1,
          type: "SELECT",
        }),
        field({
          config: { relationKind: "MANY", targetEntityTypeId: "people" },
          id: "people",
          key: "personas",
          multiple: true,
          sortOrder: 2,
          type: "RELATION",
        }),
      ],
    }) as never);

    const response = await entityDefinitionGET(
      await apiRequest("/api/v1/contracts/contract_1/entities/entity_1"),
      { params: Promise.resolve({ contractId: "contract_1", entityTypeId: "entity_1" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.entity.fields.map((item: { key: string }) => item.key)).toEqual([
      "estado",
      "personas",
    ]);
    expect(body.data.entity.icon).toBeNull();
    expect(body.data.entity.nature).toBe("MASTER");
    expect(body.data.entity.fields[0]).toMatchObject({
      options: [{ active: true, label: "Activo", value: "activo" }],
      type: "SELECT",
    });
    expect(body.data.entity.fields[1]).toMatchObject({
      config: { relation: { relationKind: "MANY", targetEntityTypeId: "people" } },
      type: "RELATION",
    });
  });

  it("returns 404 for an entity from another contract or a missing entity", async () => {
    entityTypeFindFirst.mockResolvedValue(null);

    const response = await entityDefinitionGET(
      await apiRequest("/api/v1/contracts/contract_1/entities/foreign_entity"),
      { params: Promise.resolve({ contractId: "contract_1", entityTypeId: "foreign_entity" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "ENTITY_NOT_FOUND" },
      ok: false,
    });
  });
});

describe("GET /api/v1/contracts/[contractId]/entities/[entityTypeId]/records", () => {
  it("lists records with pagination, search and serialized values", async () => {
    entityTypeFindFirst.mockResolvedValue(entity({
      fields: [
        field({ id: "code", key: "codigo", searchable: true }),
        field({ id: "amount", key: "monto", type: "DECIMAL" }),
      ],
    }) as never);
    entityRecordCount.mockResolvedValue(1);
    entityRecordFindMany
      .mockResolvedValueOnce([{ id: "record_1" }] as never)
      .mockResolvedValueOnce([
        {
          displayName: "EQ-001",
          id: "record_1",
          outgoingRelations: [],
          updatedAt: recordUpdatedAt,
          values: [
            { entityFieldId: "code", textValue: "EQ-001" },
            { decimalValue: new Prisma.Decimal("123.45"), entityFieldId: "amount" },
          ],
        },
      ] as never);

    const response = await recordsGET(
      await apiRequest("/api/v1/contracts/contract_1/entities/entity_1/records?page=1&pageSize=50&search=EQ"),
      { params: Promise.resolve({ contractId: "contract_1", entityTypeId: "entity_1" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
        records: [
          {
            displayName: "EQ-001",
            id: "record_1",
            updatedAt: recordUpdatedAtIso,
            values: {
              codigo: "EQ-001",
              monto: "123.45",
            },
          },
        ],
      },
    });
    expect(entityRecordCount).toHaveBeenCalled();
  });

  it("returns an empty page when there are no records", async () => {
    entityTypeFindFirst.mockResolvedValue(entity() as never);
    entityRecordCount.mockResolvedValue(0);
    entityRecordFindMany.mockResolvedValueOnce([] as never);

    const response = await recordsGET(
      await apiRequest("/api/v1/contracts/contract_1/entities/entity_1/records"),
      { params: Promise.resolve({ contractId: "contract_1", entityTypeId: "entity_1" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
        records: [],
      },
      ok: true,
    });
  });

  it("rejects invalid pagination and invalid sort", async () => {
    entityTypeFindFirst.mockResolvedValue(entity() as never);

    const invalidPagination = await recordsGET(
      await apiRequest("/api/v1/contracts/contract_1/entities/entity_1/records?page=0&pageSize=500"),
      { params: Promise.resolve({ contractId: "contract_1", entityTypeId: "entity_1" }) },
    );
    const invalidSort = await recordsGET(
      await apiRequest("/api/v1/contracts/contract_1/entities/entity_1/records?sort=field:unknown"),
      { params: Promise.resolve({ contractId: "contract_1", entityTypeId: "entity_1" }) },
    );

    expect(invalidPagination.status).toBe(400);
    expect(await invalidPagination.json()).toMatchObject({
      error: { code: "INVALID_PAGINATION" },
      ok: false,
    });
    expect(invalidSort.status).toBe(400);
    expect(await invalidSort.json()).toMatchObject({
      error: { code: "INVALID_SORT" },
      ok: false,
    });
  });
});

describe("POST /api/v1/contracts/[contractId]/entities/[entityTypeId]/records", () => {
  it("creates a record from values keyed by EntityField.key", async () => {
    entityTypeFindFirst.mockResolvedValue(entity() as never);
    entityRecordFindMany.mockResolvedValueOnce([] as never);
    entityRecordFindFirst.mockResolvedValueOnce({
      displayName: "EQ-001",
      id: "record_1",
      outgoingRelations: [],
      updatedAt: recordUpdatedAt,
      values: [{ entityFieldId: "field_codigo", textValue: "EQ-001" }],
    } as never);

    const response = await recordsPOST(
      new Request("http://localhost/api/v1/contracts/contract_1/entities/entity_1/records", {
        body: JSON.stringify({
          clientRequestId: "client-request-1",
          values: { codigo: "EQ-001" },
        }),
        headers: (await apiRequest("/api/v1/contracts/contract_1/entities/entity_1/records")).headers,
        method: "POST",
      }),
      { params: Promise.resolve({ contractId: "contract_1", entityTypeId: "entity_1" }) },
    );

    expect(response.status).toBe(201);
    const json = await response.json();

    expect(json).toEqual({
      ok: true,
      data: {
        record: {
          displayName: "EQ-001",
          id: "record_1",
          updatedAt: recordUpdatedAtIso,
          values: { codigo: "EQ-001" },
        },
      },
    });
    expect(new Date(json.data.record.updatedAt).toISOString()).toBe(json.data.record.updatedAt);
    expect(entityRecordCreate).toHaveBeenCalledWith({
      data: { displayName: "EQ-001", entityTypeId: "entity_1" },
    });
    expect(apiIdempotencyKeyCreate).toHaveBeenCalled();
  });
});

describe("GET /api/v1/contracts/[contractId]/entities/[entityTypeId]/records/[recordId]", () => {
  it("returns a single record with relation references", async () => {
    entityTypeFindFirst.mockResolvedValue(entity({
      fields: [
        field({
          config: { relationKind: "ONE", targetEntityTypeId: "people" },
          id: "owner",
          key: "responsable",
          type: "RELATION",
        }),
      ],
    }) as never);
    entityRecordFindFirst.mockResolvedValue({
      displayName: "EQ-001",
      id: "record_1",
      outgoingRelations: [
        {
          sourceFieldId: "owner",
          targetRecord: {
            displayName: "Persona 1",
            entityTypeId: "people",
            id: "person_1",
          },
          targetRecordId: "person_1",
        },
      ],
      updatedAt: recordUpdatedAt,
      values: [],
    } as never);

    const response = await recordDetailGET(
      await apiRequest("/api/v1/contracts/contract_1/entities/entity_1/records/record_1"),
      {
        params: Promise.resolve({
          contractId: "contract_1",
          entityTypeId: "entity_1",
          recordId: "record_1",
        }),
      },
    );

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json).toEqual({
      ok: true,
      data: {
        record: {
          displayName: "EQ-001",
          id: "record_1",
          updatedAt: recordUpdatedAtIso,
          values: {
            responsable: {
              displayName: "Persona 1",
              entityTypeId: "people",
              id: "person_1",
            },
          },
        },
      },
    });
  });

  it("returns 404 for a missing record or a record from another entity", async () => {
    entityTypeFindFirst.mockResolvedValue(entity() as never);
    entityRecordFindFirst.mockResolvedValue(null);

    const response = await recordDetailGET(
      await apiRequest("/api/v1/contracts/contract_1/entities/entity_1/records/foreign_record"),
      {
        params: Promise.resolve({
          contractId: "contract_1",
          entityTypeId: "entity_1",
          recordId: "foreign_record",
        }),
      },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "RECORD_NOT_FOUND" },
      ok: false,
    });
  });
});

describe("PATCH /api/v1/contracts/[contractId]/entities/[entityTypeId]/records/[recordId]", () => {
  it("partially updates a record and leaves omitted values intact", async () => {
    entityTypeFindFirst.mockResolvedValue(entity({
      fields: [
        field({ id: "field_codigo", key: "codigo", required: true }),
        field({ id: "field_nota", key: "nota", required: false, sortOrder: 2 }),
      ],
    }) as never);
    entityRecordFindFirst
      .mockResolvedValueOnce({
        displayName: "EQ-001",
        id: "record_1",
        outgoingRelations: [],
        updatedAt: recordUpdatedAt,
        values: [
          { entityFieldId: "field_codigo", textValue: "EQ-001" },
          { entityFieldId: "field_nota", textValue: "Anterior" },
        ],
      } as never)
      .mockResolvedValueOnce({
        displayName: "EQ-001",
        id: "record_1",
        outgoingRelations: [],
        updatedAt: laterRecordUpdatedAt,
        values: [
          { entityFieldId: "field_codigo", textValue: "EQ-001" },
          { entityFieldId: "field_nota", textValue: "Nueva" },
        ],
      } as never);
    entityRecordFindMany.mockResolvedValueOnce([] as never);

    const response = await recordDetailPATCH(
      new Request("http://localhost/api/v1/contracts/contract_1/entities/entity_1/records/record_1", {
        body: JSON.stringify({ values: { nota: "Nueva" } }),
        headers: (await apiRequest("/api/v1/contracts/contract_1/entities/entity_1/records/record_1")).headers,
        method: "PATCH",
      }),
      {
        params: Promise.resolve({
          contractId: "contract_1",
          entityTypeId: "entity_1",
          recordId: "record_1",
        }),
      },
    );

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json).toEqual({
      ok: true,
      data: {
        record: {
          displayName: "EQ-001",
          id: "record_1",
          updatedAt: laterRecordUpdatedAtIso,
          values: {
            codigo: "EQ-001",
            nota: "Nueva",
          },
        },
      },
    });
    expect(new Date(json.data.record.updatedAt).toISOString()).toBe(json.data.record.updatedAt);
    expect(json.data.record.updatedAt).not.toBe(recordUpdatedAtIso);
    expect(entityValueCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ entityFieldId: "field_codigo", textValue: "EQ-001" }),
        expect.objectContaining({ entityFieldId: "field_nota", textValue: "Nueva" }),
      ]),
    });
  });
});
