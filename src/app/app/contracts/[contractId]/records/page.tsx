import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "@/auth";
import { EntityIcon } from "@/components/entity-icon";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getEntityNatureLabel } from "@/lib/entity-nature";
import { getRecordEntityTypes } from "@/lib/entity-records";

const entityNatureGroups = [
  { title: "Maestras", value: "MASTER" },
  { title: "Transaccionales", value: "TRANSACTION" },
  { title: "Referencia", value: "REFERENCE" },
] as const;

export default async function RecordsPage({
  params,
}: {
  params: Promise<{ contractId: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { contractId } = await params;
  const data = await getRecordEntityTypes(contractId, session.user.id);

  if (!data) {
    notFound();
  }

  const groupedEntityTypes = entityNatureGroups
    .map((group) => ({
      ...group,
      entityTypes: data.entityTypes.filter((entityType) => entityType.nature === group.value),
    }))
    .filter((group) => group.entityTypes.length > 0);

  return (
    <div className="-mt-4 grid w-full gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Registros</h1>
        <p className="text-sm text-muted-foreground">
          Fuente operacional del contrato organizada por tipo de entidad.
        </p>
      </header>

      {data.entityTypes.length > 0 ? (
        <div className="grid gap-8">
          {groupedEntityTypes.map((group) => (
            <section className="grid gap-3" key={group.value}>
              <header className="flex items-center gap-3 border-b border-border pb-2">
                <h2 className="text-base font-semibold">{group.title}</h2>
                <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                  {group.entityTypes.length}
                </span>
              </header>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {group.entityTypes.map((entityType) => (
                  <Card key={entityType.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <CardTitle className="flex items-center gap-2">
                            <EntityIcon className="text-muted-foreground" icon={entityType.icon} />
                            {entityType.name}
                          </CardTitle>
                          <CardDescription>{entityType.description}</CardDescription>
                        </div>
                        <span className="shrink-0 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-medium text-muted-foreground">
                          {getEntityNatureLabel(entityType.nature)}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                        <div>
                          Activos:{" "}
                          <span className="font-medium text-foreground">
                            {entityType.records.length}
                          </span>
                        </div>
                        <div>
                          Total:{" "}
                          <span className="font-medium text-foreground">
                            {entityType._count.records}
                          </span>
                        </div>
                      </div>
                      <Button asChild variant="outline">
                        <Link href={`/app/contracts/${contractId}/records/${entityType.id}`}>
                          Abrir listado
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                No hay tipos de entidad activos para registrar.
              </p>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
