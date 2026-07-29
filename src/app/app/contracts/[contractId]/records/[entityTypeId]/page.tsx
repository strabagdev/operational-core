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
  recordStatusLabels,
} from "@/lib/entity-records";

import { archiveEntityRecordAction, restoreEntityRecordAction } from "../actions";

export default async function EntityRecordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ contractId: string; entityTypeId: string }>;
  searchParams: Promise<{ q?: string; status?: string; error?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { contractId, entityTypeId } = await params;
  const { q, status, error } = await searchParams;
  const data = await getEntityRecords({
    contractId,
    entityTypeId,
    userId: session.user.id,
    query: q,
    status: parseStatus(status),
  });

  if (!data) {
    notFound();
  }

  const primaryField = getPrimaryDisplayField(data.entityType.fields);
  const listFields = getRecordListFields(data.entityType.fields);
  const displayHeader = primaryField?.name ?? "Nombre";
  const parsedStatus = parseStatus(status);

  return (
    <div className="grid max-w-6xl gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{data.entityType.name}</h1>
          <p className="text-sm text-muted-foreground">
            Registros operacionales de este tipo de entidad.
          </p>
        </div>
        <Button asChild>
          <Link href={`/app/contracts/${contractId}/records/${entityTypeId}/new`}>
            Crear registro
          </Link>
        </Button>
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
          <form className="grid gap-3 md:grid-cols-[1fr_180px_auto]" method="get">
            <input
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
              defaultValue={q ?? ""}
              name="q"
              placeholder="Buscar"
            />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={parsedStatus}
              name="status"
            >
              <option value="ACTIVE">Registros activos</option>
              <option value="INACTIVE">Registros inactivos</option>
              <option value="ARCHIVED">Registros archivados</option>
              <option value="ALL">Todos los registros</option>
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
            {data.records.length} registro{data.records.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="py-3 pr-4 font-medium">{displayHeader}</th>
                  {listFields.map((field) => (
                    <th className="py-3 pr-4 font-medium" key={field.id}>
                      {field.name}
                    </th>
                  ))}
                  <th className="py-3 pr-4 font-medium">Actualizado</th>
                  <th className="py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.records.length > 0 ? (
                  data.records.map((record) => (
                    <tr className="border-b border-border" key={record.id}>
                      <td className="py-3 pr-4 font-medium">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{record.displayName}</span>
                          {shouldShowStatusBadge(record.status, parsedStatus) ? (
                            <span className="rounded-full border border-border px-2 py-0.5 text-xs font-normal text-muted-foreground">
                              {recordStatusLabels[record.status]}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      {listFields.map((field) => {
                        const value = record.values.find(
                          (item) => item.entityFieldId === field.id,
                        );

                        return (
                          <td className="py-3 pr-4" key={field.id}>
                            {value ? deserializeEntityValue(value) : ""}
                          </td>
                        );
                      })}
                      <td className="py-3 pr-4">
                        {record.updatedAt.toLocaleDateString("es-CL")}
                      </td>
                      <td className="py-3">
                        <div className="flex justify-end gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link
                              href={`/app/contracts/${contractId}/records/${entityTypeId}/${record.id}`}
                            >
                              Editar
                            </Link>
                          </Button>
                          {record.status !== "ARCHIVED" ? (
                            <form
                              action={archiveEntityRecordAction.bind(
                                null,
                                contractId,
                                entityTypeId,
                                record.id,
                              )}
                            >
                              <Button size="sm" type="submit" variant="ghost">
                                Archivar
                              </Button>
                            </form>
                          ) : (
                            <form
                              action={restoreEntityRecordAction.bind(
                                null,
                                contractId,
                                entityTypeId,
                                record.id,
                              )}
                            >
                              <Button size="sm" type="submit" variant="ghost">
                                Restaurar
                              </Button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      className="py-6 text-sm text-muted-foreground"
                      colSpan={3 + listFields.length}
                    >
                      No hay registros para estos filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function parseStatus(value?: string) {
  if (value === "ACTIVE" || value === "INACTIVE" || value === "ARCHIVED") {
    return value;
  }

  return "ALL";
}

function shouldShowStatusBadge(
  recordStatus: "ACTIVE" | "INACTIVE" | "ARCHIVED",
  currentFilter: "ACTIVE" | "INACTIVE" | "ARCHIVED" | "ALL",
) {
  return recordStatus !== "ACTIVE" || currentFilter !== "ACTIVE";
}
