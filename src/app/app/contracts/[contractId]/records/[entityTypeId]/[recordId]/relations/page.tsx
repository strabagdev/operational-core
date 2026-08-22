import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Search } from "lucide-react";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getIncomingRecordRelationsPage } from "@/lib/entity-records";

export default async function EntityRecordRelationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ contractId: string; entityTypeId: string; recordId: string }>;
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    q?: string;
    sourceEntityTypeId?: string;
    sourceFieldId?: string;
  }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { contractId, entityTypeId, recordId } = await params;
  const { page, pageSize, q, sourceEntityTypeId, sourceFieldId } = await searchParams;

  if (!sourceEntityTypeId || !sourceFieldId) {
    notFound();
  }

  const data = await getIncomingRecordRelationsPage({
    contractId,
    entityTypeId,
    recordId,
    sourceEntityTypeId,
    sourceFieldId,
    userId: session.user.id,
    page: parsePositiveInteger(page, 1),
    pageSize: parsePageSize(pageSize),
    query: q,
  });

  if (!data) {
    notFound();
  }

  const detailPath = `/app/contracts/${contractId}/records/${entityTypeId}/${recordId}`;
  const basePath = `${detailPath}/relations`;

  return (
    <div className="grid max-w-4xl gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">
            {data.sourceEntityType.name} · {data.sourceField.name}
          </p>
          <h1 className="text-2xl font-semibold">Registros relacionados</h1>
          <p className="text-sm text-muted-foreground">
            Apuntan hacia {data.record.displayName}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={detailPath}>Volver al registro</Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Relacionado desde</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form action={basePath} className="flex flex-col gap-2 sm:flex-row">
            <input name="sourceEntityTypeId" type="hidden" value={sourceEntityTypeId} />
            <input name="sourceFieldId" type="hidden" value={sourceFieldId} />
            <input
              className="min-h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              defaultValue={data.query}
              name="q"
              placeholder="Buscar por nombre"
              type="search"
            />
            <input name="pageSize" type="hidden" value={data.pagination.pageSize} />
            <Button type="submit" variant="outline">
              <Search aria-hidden="true" className="h-4 w-4" />
              Buscar
            </Button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="py-3 pr-4 font-medium">{data.sourceEntityType.name}</th>
                  <th className="py-3 pr-4 font-medium">Campo origen</th>
                  <th className="py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.records.length > 0 ? (
                  data.records.map((record) => (
                    <tr className="border-b border-border" key={record.id}>
                      <td className="py-3 pr-4 font-medium">
                        <Link
                          className="text-primary underline-offset-4 hover:underline"
                          href={`/app/contracts/${contractId}/records/${data.sourceEntityType.id}/${record.id}`}
                        >
                          {record.displayName}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {data.sourceField.name}
                      </td>
                      <td className="py-3 text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/app/contracts/${contractId}/records/${data.sourceEntityType.id}/${record.id}`}>
                            Abrir
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="py-6 text-muted-foreground" colSpan={3}>
                      No hay registros para estos filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls
            basePath={basePath}
            page={data.pagination.page}
            pageSize={data.pagination.pageSize}
            query={data.query}
            sourceEntityTypeId={sourceEntityTypeId}
            sourceFieldId={sourceFieldId}
            totalPages={data.pagination.totalPages}
            totalRecords={data.pagination.totalRecords}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function PaginationControls({
  basePath,
  page,
  pageSize,
  query,
  sourceEntityTypeId,
  sourceFieldId,
  totalPages,
  totalRecords,
}: {
  basePath: string;
  page: number;
  pageSize: number;
  query?: string;
  sourceEntityTypeId: string;
  sourceFieldId: string;
  totalPages: number;
  totalRecords: number;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
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
            <Link href={relationsPageHref({
              basePath,
              page: page - 1,
              pageSize,
              query,
              sourceEntityTypeId,
              sourceFieldId,
            })}>
              Anterior
            </Link>
          </Button>
        )}
        {page >= totalPages ? (
          <Button disabled size="sm" variant="outline">
            Siguiente
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link href={relationsPageHref({
              basePath,
              page: page + 1,
              pageSize,
              query,
              sourceEntityTypeId,
              sourceFieldId,
            })}>
              Siguiente
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function relationsPageHref({
  basePath,
  page,
  pageSize,
  query,
  sourceEntityTypeId,
  sourceFieldId,
}: {
  basePath: string;
  page: number;
  pageSize: number;
  query?: string;
  sourceEntityTypeId: string;
  sourceFieldId: string;
}) {
  const params = new URLSearchParams({
    sourceEntityTypeId,
    sourceFieldId,
  });

  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  if (pageSize !== 25) params.set("pageSize", String(pageSize));

  return `${basePath}?${params.toString()}`;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePageSize(value?: string) {
  const parsed = Number(value);

  return parsed === 25 || parsed === 50 || parsed === 100 ? parsed : 25;
}
