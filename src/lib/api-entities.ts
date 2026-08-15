import { Prisma } from "@prisma/client";

import { badRequest, notFound } from "@/lib/api-response";
import {
  buildEntityRecordSearchWhere,
  getEntityRecordIdsForSort,
  resolveEntityRecordSort,
} from "@/lib/entity-records";
import { orderEntityFields } from "@/lib/entity-field-order";
import { prisma } from "@/lib/prisma";

export const apiRecordDefaultPage = 1;
export const apiRecordDefaultPageSize = 50;
export const apiRecordMaxPageSize = 100;

export type ApiRecordListQuery = {
  direction?: "asc" | "desc";
  page: number;
  pageSize: number;
  search?: string;
  sort?: {
    direction: "asc" | "desc";
    key: "displayName" | "updatedAt" | `field:${string}`;
  };
};

type ApiEntityFieldForQuery = Awaited<ReturnType<typeof getApiEntityDefinition>> extends infer T
  ? T extends { fields: infer F }
    ? F extends Array<infer Field>
      ? Field
      : never
    : never
  : never;

export type ApiRecordEntity = NonNullable<Awaited<ReturnType<typeof getApiEntityDefinition>>>;

export async function getApiContractEntities(contractId: string) {
  return prisma.entityType.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      contractId: true,
      icon: true,
      isActive: true,
      name: true,
      nature: true,
      slug: true,
    },
    where: {
      contractId,
      isActive: true,
    },
  });
}

export async function getApiEntityDefinition(
  contractId: string,
  entityTypeId: string,
) {
  return prisma.entityType.findFirst({
    select: {
      fields: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: {
          createdAt: true,
          config: true,
          description: true,
          entityTypeId: true,
          id: true,
          isActive: true,
          isUnique: true,
          key: true,
          multiple: true,
          name: true,
          options: {
            orderBy: [{ sortOrder: "asc" }, { label: "asc" }, { id: "asc" }],
            select: {
              id: true,
              isActive: true,
              label: true,
              sortOrder: true,
              value: true,
            },
          },
          required: true,
          searchable: true,
          sortOrder: true,
          type: true,
          updatedAt: true,
        },
        where: {
          isActive: true,
        },
      },
      contractId: true,
      icon: true,
      id: true,
      isActive: true,
      name: true,
      nature: true,
      slug: true,
    },
    where: {
      contractId,
      id: entityTypeId,
      isActive: true,
    },
  });
}

export function parseApiRecordListQuery(
  searchParams: URLSearchParams,
  fields: ApiEntityFieldForQuery[],
):
  | { ok: true; query: ApiRecordListQuery }
  | { ok: false; response: Response } {
  const page = parsePositiveInteger(searchParams.get("page"), apiRecordDefaultPage);
  const pageSize = parsePositiveInteger(
    searchParams.get("pageSize"),
    apiRecordDefaultPageSize,
  );

  if (!page || !pageSize || pageSize > apiRecordMaxPageSize) {
    return {
      ok: false,
      response: badRequest(
        `page debe ser mayor a 0 y pageSize debe estar entre 1 y ${apiRecordMaxPageSize}.`,
        "INVALID_PAGINATION",
      ),
    };
  }

  const directionParam = searchParams.get("direction");
  const direction = directionParam === null || directionParam === ""
    ? undefined
    : directionParam;

  if (direction !== undefined && direction !== "asc" && direction !== "desc") {
    return {
      ok: false,
      response: badRequest(
        "direction debe ser asc o desc.",
        "INVALID_SORT",
      ),
    };
  }

  const sort = parseApiRecordSort(searchParams.get("sort"), direction ?? "desc", fields);

  if (!sort.ok) {
    return {
      ok: false,
      response: badRequest(
        "sort debe ser displayName, updatedAt o field:<fieldKey>.",
        "INVALID_SORT",
      ),
    };
  }

  const search = searchParams.get("search")?.trim() || undefined;

  return {
    ok: true,
    query: {
      direction,
      page,
      pageSize,
      search,
      sort: sort.sort,
    },
  };
}

function parsePositiveInteger(value: string | null, fallback: number) {
  if (value === null || value === "") {
    return fallback;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  return parsed > 0 && Number.isSafeInteger(parsed) ? parsed : null;
}

function parseApiRecordSort(
  sort: string | null,
  direction: "asc" | "desc",
  fields: ApiEntityFieldForQuery[],
):
  | { ok: true; sort?: ApiRecordListQuery["sort"] }
  | { ok: false } {
  if (!sort) {
    return { ok: true };
  }

  if (sort === "displayName" || sort === "updatedAt") {
    return { ok: true, sort: { direction, key: sort } };
  }

  if (sort.startsWith("field:")) {
    const fieldKey = sort.slice("field:".length);
    const field = fields.find((item) => item.key === fieldKey);

    if (!field || !resolveEntityRecordSort({
      fields,
      sortKey: `field:${field.id}`,
    }).explicit) {
      return { ok: false };
    }

    return { ok: true, sort: { direction, key: `field:${field.id}` } };
  }

  return { ok: false };
}

export async function getApiEntityRecords({
  entityType,
  query,
}: {
  entityType: NonNullable<Awaited<ReturnType<typeof getApiEntityDefinition>>>;
  query: ApiRecordListQuery;
}) {
  const orderedFields = orderEntityFields(entityType.fields);
  const recordWhere = buildEntityRecordSearchWhere({
    entityTypeId: entityType.id,
    fields: orderedFields,
    query: query.search,
  });
  const totalRecords = await prisma.entityRecord.count({ where: recordWhere });
  const skip = (query.page - 1) * query.pageSize;
  const sort = query.sort
    ? resolveEntityRecordSort({
        fields: orderedFields,
        sortKey: query.sort.key,
        direction: query.sort.direction,
      })
    : resolveEntityRecordSort({ fields: orderedFields });
  const sortedIds = await getEntityRecordIdsForSort({
    entityTypeId: entityType.id,
    fields: orderedFields,
    query: query.search,
    sort: {
      direction: sort.direction,
      key: sort.key,
    },
  });
  const ids = sortedIds.ids.slice(skip, skip + query.pageSize);
  const records = ids.length === 0
    ? []
    : await prisma.entityRecord.findMany({
        include: apiEntityRecordInclude(orderedFields.map((field) => field.id)),
        where: {
          entityTypeId: entityType.id,
          id: { in: ids },
        },
      });
  const order = new Map(ids.map((id, index) => [id, index]));

  return {
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total: totalRecords,
      totalPages: Math.max(1, Math.ceil(totalRecords / query.pageSize)),
    },
    records: records.sort((left, right) => {
      return (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0);
    }),
  };
}

export async function getApiEntityRecord({
  entityType,
  recordId,
}: {
  entityType: NonNullable<Awaited<ReturnType<typeof getApiEntityDefinition>>>;
  recordId: string;
}) {
  return prisma.entityRecord.findFirst({
    include: apiEntityRecordInclude(entityType.fields.map((field) => field.id)),
    where: {
      entityTypeId: entityType.id,
      id: recordId,
    },
  });
}

function apiEntityRecordInclude(fieldIds: string[]) {
  return {
    outgoingRelations: {
      include: {
        targetRecord: {
          select: {
            displayName: true,
            entityTypeId: true,
            id: true,
          },
        },
      },
      where: {
        sourceFieldId: { in: fieldIds },
      },
    },
    values: {
      select: {
        booleanValue: true,
        dateValue: true,
        decimalValue: true,
        entityFieldId: true,
        integerValue: true,
        jsonValue: true,
        textValue: true,
      },
      where: {
        entityFieldId: { in: fieldIds },
      },
    },
  } satisfies Prisma.EntityRecordInclude;
}

export function apiEntityNotFoundResponse() {
  return notFound("Entidad no encontrada", "ENTITY_NOT_FOUND");
}

export function apiRecordNotFoundResponse() {
  return notFound("Registro no encontrado", "RECORD_NOT_FOUND");
}
