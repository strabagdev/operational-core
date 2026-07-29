import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getRecordEntityTypes } from "@/lib/entity-records";

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

  return (
    <div className="grid max-w-5xl gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Registros</h1>
        <p className="text-sm text-muted-foreground">
          Fuente operacional del contrato organizada por tipo de entidad.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {data.entityTypes.length > 0 ? (
          data.entityTypes.map((entityType) => (
            <Card key={entityType.id}>
              <CardHeader>
                <CardTitle>{entityType.name}</CardTitle>
                <CardDescription>{entityType.description}</CardDescription>
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
          ))
        ) : (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                No hay tipos de entidad activos para registrar.
              </p>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
