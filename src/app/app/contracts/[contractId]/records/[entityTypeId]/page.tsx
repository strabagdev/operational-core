import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  deserializeEntityValue,
  getEntityRecords,
  getPrimaryDisplayField,
  getRecordListFields,
  resolveEntityRecordSort,
} from "@/lib/entity-records";

import { deleteEntityRecordsAction } from "../actions";
import { EntityRecordsTable } from "./entity-records-table";
import { ImportRecordsSheet } from "./import-records-sheet";

type SortHeaderState = {
  active: boolean;
  direction: "asc" | "desc";
  href: string;
};

export default async function EntityRecordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ contractId: string; entityTypeId: string }>;
  searchParams: Promise<{
    dir?: string;
    error?: string;
    page?: string;
    pageSize?: string;
    q?: string;
    sort?: string;
  }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { contractId, entityTypeId } = await params;
  const { q, page, pageSize, sort, dir, error } = await searchParams;
  const parsedPage = parsePositiveInteger(page, 1);
  const parsedPageSize = parsePageSize(pageSize);
  const data = await getEntityRecords({
    contractId,
    entityTypeId,
    userId: session.user.id,
    page: parsedPage,
    pageSize: parsedPageSize,
    query: q,
    sort: { key: sort, direction: dir },
  });

  if (!data) {
    notFound();
  }

  const primaryField = getPrimaryDisplayField(data.entityType.fields);
  const listFields = getRecordListFields(data.entityType.fields);
  const displayHeader = primaryField?.name ?? "Nombre";
  const fieldsById = new Map(data.entityType.fields.map((field) => [field.id, field]));
  const basePath = `/app/contracts/${contractId}/records/${entityTypeId}`;
  const sortableFields = listFields.filter((field) =>
    resolveEntityRecordSort({
      fields: data.entityType.fields,
      listFields,
      sortKey: `field:${field.id}`,
      direction: "asc",
    }).explicit,
  );
  const sortOptions = [
    { label: displayHeader, value: "displayName" },
    ...sortableFields.map((field) => ({ label: field.name, value: `field:${field.id}` })),
    { label: "Actualizado", value: "updatedAt" },
  ];
  const tableRecords = data.records.map((record) => ({
    id: record.id,
    displayName: record.displayName,
    updatedAt: record.updatedAt.toLocaleDateString("es-CL"),
    values: listFields.map((field) => {
      const value = record.values.find((item) => item.entityFieldId === field.id);
      const fieldConfig = fieldsById.get(field.id);

      return {
        fieldId: field.id,
        value: value
          ? deserializeEntityValue({
              ...value,
              entityField: fieldConfig
                ? { type: fieldConfig.type, config: fieldConfig.config, options: fieldConfig.options }
                : undefined,
            })
          : "",
      };
    }),
  }));

  return (
    <div className="grid w-full gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{data.entityType.name}</h1>
          <p className="text-sm text-muted-foreground">
            Registros operacionales de este tipo de entidad.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild variant="outline">
            <a href={`/app/contracts/${contractId}/records/${entityTypeId}/template`}>
              Descargar plantilla
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={exportHref({
              basePath,
              query: q,
              sort: data.sort,
            })}
            >
              Exportar datos ({data.pagination.totalRecords})
            </a>
          </Button>
          <ImportRecordsSheet
            contractId={contractId}
            entityName={data.entityType.name}
            entityTypeId={entityTypeId}
          />
          <Button asChild>
            <Link href={`/app/contracts/${contractId}/records/${entityTypeId}/new`}>
              Crear registro
            </Link>
          </Button>
        </div>
      </header>

      {error ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          <form className="grid gap-3 md:grid-cols-[1fr_160px_160px_150px_auto]" method="get">
            <input
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
              defaultValue={q ?? ""}
              name="q"
              placeholder="Buscar"
            />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={data.pagination.pageSize}
              name="pageSize"
            >
              <option value="25">25 por página</option>
              <option value="50">50 por página</option>
              <option value="100">100 por página</option>
            </select>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={data.sort?.key ?? "displayName"}
              name="sort"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={data.sort?.direction ?? "desc"}
              name="dir"
            >
              <option value="asc">Ascendente</option>
              <option value="desc">Descendente</option>
            </select>
            <Button type="submit" variant="outline">
              Filtrar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
          <CardDescription>
            {data.records.length} de {data.pagination.totalRecords} registro
            {data.pagination.totalRecords === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EntityRecordsTable
            contractId={contractId}
            deleteAction={deleteEntityRecordsAction.bind(null, contractId, entityTypeId)}
            displayHeader={displayHeader}
            displaySort={sortHeader({
              basePath,
              currentSort: data.sort,
              pageSize: data.pagination.pageSize,
              query: q,
              sortKey: "displayName",
            })}
            entityTypeId={entityTypeId}
            key={`${entityTypeId}:${q ?? ""}:${tableRecords.map((record) => record.id).join("|")}`}
            listFields={listFields.map((field) => ({
              id: field.id,
              name: field.name,
              sort: sortableFields.some((item) => item.id === field.id)
                ? sortHeader({
                    basePath,
                    currentSort: data.sort,
                    pageSize: data.pagination.pageSize,
                    query: q,
                    sortKey: `field:${field.id}`,
                  })
                : undefined,
            }))}
            records={tableRecords}
            updatedAtSort={sortHeader({
              basePath,
              currentSort: data.sort,
              pageSize: data.pagination.pageSize,
              query: q,
              sortKey: "updatedAt",
            })}
          />
          <PaginationControls
            basePath={basePath}
            page={data.pagination.page}
            pageSize={data.pagination.pageSize}
            query={q}
            sort={data.sort}
            totalPages={data.pagination.totalPages}
            totalRecords={data.pagination.totalRecords}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePageSize(value?: string) {
  const parsed = Number(value);

  return parsed === 25 || parsed === 50 || parsed === 100 ? parsed : 25;
}

function PaginationControls({
  basePath,
  page,
  pageSize,
  query,
  totalPages,
  totalRecords,
  sort,
}: {
  basePath: string;
  page: number;
  pageSize: number;
  query?: string;
  sort?: { key: string; direction: string } | null;
  totalPages: number;
  totalRecords: number;
}) {
  const previousHref = pageHref({ basePath, page: page - 1, pageSize, query, sort });
  const nextHref = pageHref({ basePath, page: page + 1, pageSize, query, sort });

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground">
        Página {page} de {totalPages} · {totalRecords} registros
      </p>
      <div className="flex flex-wrap gap-2">
        {page <= 1 ? (
          <Button disabled size="sm" variant="outline">
            Anterior
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link href={previousHref}>Anterior</Link>
          </Button>
        )}
        {page >= totalPages ? (
          <Button disabled size="sm" variant="outline">
            Siguiente
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link href={nextHref}>Siguiente</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function pageHref({
  basePath,
  page,
  pageSize,
  query,
  sort,
}: {
  basePath: string;
  page: number;
  pageSize: number;
  query?: string;
  sort?: { key: string; direction: string } | null;
}) {
  const params = new URLSearchParams();

  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  if (pageSize !== 25) params.set("pageSize", String(pageSize));
  if (sort) {
    params.set("sort", sort.key);
    params.set("dir", sort.direction);
  }

  const queryString = params.toString();

  return queryString ? `${basePath}?${queryString}` : basePath;
}

function sortHeader({
  basePath,
  currentSort,
  pageSize,
  query,
  sortKey,
}: {
  basePath: string;
  currentSort?: { key: string; direction: "asc" | "desc" } | null;
  pageSize: number;
  query?: string;
  sortKey: string;
}): SortHeaderState {
  const active = currentSort?.key === sortKey;
  const direction: "asc" | "desc" = active && currentSort?.direction === "asc" ? "asc" : "desc";
  const nextDirection: "asc" | "desc" = active && direction === "asc" ? "desc" : "asc";

  return {
    active,
    direction,
    href: pageHref({
      basePath,
      page: 1,
      pageSize,
      query,
      sort: { key: sortKey, direction: nextDirection },
    }),
  };
}

function exportHref({
  basePath,
  query,
  sort,
}: {
  basePath: string;
  query?: string;
  sort?: { key: string; direction: string } | null;
}) {
  const params = new URLSearchParams();

  if (query) params.set("q", query);
  if (sort) {
    params.set("sort", sort.key);
    params.set("dir", sort.direction);
  }

  const queryString = params.toString();

  return `${basePath}/export${queryString ? `?${queryString}` : ""}`;
}
