import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { type ReactNode } from "react";
import { Download, FileSpreadsheet, Plus } from "lucide-react";

import { auth } from "@/auth";
import { ActionMessage, StatusBadge } from "@/components/admin-ui";
import { EntityIcon } from "@/components/entity-icon";
import {
  DataTableShell,
  FilterBar,
  OperationalPageHeader,
  PaginationBar,
} from "@/components/operational-ui";
import { Button } from "@/components/ui/button";
import {
  deserializeEntityValue,
  getEntityRecords,
  getRecordListFields,
  resolveEntityRecordSort,
} from "@/lib/entity-records";

import { deleteEntityRecordsAction } from "../actions";
import { EntityRecordsTable } from "./entity-records-table";
import { ImportRecordsSheet } from "./import-records-sheet";
import { RecordListAutoRefresh } from "./record-list-auto-refresh";
import { RecordListControls } from "./record-list-controls";

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

  const listFields = getRecordListFields(data.entityType.fields);
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
  const tableRecords = data.records.map((record) => ({
    id: record.id,
    displayName: record.displayName,
    values: listFields.map((field) => {
      const value = record.values.find((item) => item.entityFieldId === field.id);
      const fieldConfig = fieldsById.get(field.id);
      const relationValue = record.outgoingRelations
        .filter((relation) => relation.sourceFieldId === field.id)
        .map((relation) => relation.targetRecord.displayName)
        .join(", ");

      return {
        fieldId: field.id,
        value: field.type === "RELATION" ? relationValue : value
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
    <div className="-mt-6 flex h-[calc(100dvh-1.5rem)] min-h-0 w-full flex-col gap-3">
      <OperationalPageHeader
        actions={(
          <>
            <RecordListAutoRefresh />
            <TooltipIconButton label="Descargar plantilla">
              <Button asChild size="icon" variant="outline">
                <a
                  aria-label="Descargar plantilla"
                  href={`/app/contracts/${contractId}/records/${entityTypeId}/template`}
                >
                  <Download aria-hidden="true" className="h-4 w-4" />
                </a>
              </Button>
            </TooltipIconButton>
            <TooltipIconButton label="Exportar datos">
              <Button asChild size="icon" variant="outline">
                <a
                  aria-label="Exportar datos"
                  href={exportHref({
                    basePath,
                    query: q,
                    sort: data.sort,
                  })}
                >
                  <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />
                </a>
              </Button>
            </TooltipIconButton>
            <ImportRecordsSheet
              contractId={contractId}
              entityName={data.entityType.name}
              entityTypeId={entityTypeId}
            />
            <TooltipIconButton label="Crear registro">
              <Button asChild size="icon">
                <Link
                  aria-label="Crear registro"
                  href={`/app/contracts/${contractId}/records/${entityTypeId}/new`}
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                </Link>
              </Button>
            </TooltipIconButton>
          </>
        )}
      >
        <div className="grid min-w-0 gap-2 lg:grid-cols-[auto_minmax(260px,1fr)] lg:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="flex min-w-0 items-center gap-2 text-xl font-semibold" title={data.entityType.name}>
              <EntityIcon className="text-muted-foreground" icon={data.entityType.icon} />
              <span className="truncate">{data.entityType.name}</span>
            </h1>
            <StatusBadge variant="info">
              {data.pagination.totalRecords}
            </StatusBadge>
          </div>
          <FilterBar active={Boolean(q)}>
            <RecordListControls
              basePath={basePath}
              pageSize={data.pagination.pageSize}
              query={q}
              searchParams={{ dir, page, pageSize, q, sort }}
              totalRecords={data.pagination.totalRecords}
            />
          </FilterBar>
        </div>
      </OperationalPageHeader>

      {error ? (
        <ActionMessage variant="error">{error}</ActionMessage>
      ) : null}

      <DataTableShell>
        <EntityRecordsTable
          contractId={contractId}
          deleteAction={deleteEntityRecordsAction.bind(null, contractId, entityTypeId)}
          entityTypeId={entityTypeId}
          key={`${entityTypeId}:${q ?? ""}:${page ?? ""}:${pageSize ?? ""}:${sort ?? ""}:${dir ?? ""}`}
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
      </DataTableShell>
    </div>
  );
}

function TooltipIconButton({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        className="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-50 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-md transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        role="tooltip"
      >
        {label}
      </span>
    </span>
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
    <PaginationBar
      summary={(
        <>
        Página {page} de {totalPages} · {totalRecords} registros
        </>
      )}
    >
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
    </PaginationBar>
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
