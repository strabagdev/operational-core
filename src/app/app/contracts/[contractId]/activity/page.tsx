import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { auditActionLabels, getContractActivity } from "@/lib/audit";

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ contractId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { contractId } = await params;
  const { page } = await searchParams;
  const currentPage = Number.parseInt(page ?? "1", 10) || 1;
  const data = await getContractActivity(contractId, session.user.id, currentPage);

  if (!data) {
    notFound();
  }

  return (
    <div className="grid max-w-6xl gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Actividad</h1>
        <p className="text-sm text-muted-foreground">
          Cambios recientes registrados para este contrato.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Eventos recientes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="py-3 pr-4 font-medium">Usuario</th>
                  <th className="py-3 pr-4 font-medium">Acción</th>
                  <th className="py-3 pr-4 font-medium">Tipo</th>
                  <th className="py-3 pr-4 font-medium">Registro</th>
                  <th className="py-3 pr-4 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {data.events.length > 0 ? (
                  data.events.map((event) => (
                    <tr className="border-b border-border" key={event.id}>
                      <td className="py-3 pr-4">
                        {event.actorUser?.name ?? event.actorUser?.email ?? "Sistema"}
                      </td>
                      <td className="py-3 pr-4">{auditActionLabels[event.action]}</td>
                      <td className="py-3 pr-4">{event.entityType?.name ?? ""}</td>
                      <td className="py-3 pr-4">
                        {event.entityRecord ? (
                          <Link
                            className="text-primary underline-offset-4 hover:underline"
                            href={`/app/contracts/${contractId}/records/${event.entityRecord.entityTypeId}/${event.entityRecord.id}`}
                          >
                            {event.entityRecord.displayName}
                          </Link>
                        ) : (
                          ""
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {event.createdAt.toLocaleString("es-CL")}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      className="py-6 text-sm text-muted-foreground"
                      colSpan={5}
                    >
                      Todavía no hay actividad registrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        {data.page > 1 ? (
          <Button asChild variant="outline">
            <Link href={`/app/contracts/${contractId}/activity?page=${data.page - 1}`}>
              Anterior
            </Link>
          </Button>
        ) : (
          <Button disabled variant="outline">
            Anterior
          </Button>
        )}
        {data.hasNextPage ? (
          <Button asChild variant="outline">
            <Link href={`/app/contracts/${contractId}/activity?page=${data.page + 1}`}>
              Siguiente
            </Link>
          </Button>
        ) : (
          <Button disabled variant="outline">
            Siguiente
          </Button>
        )}
      </div>
    </div>
  );
}
