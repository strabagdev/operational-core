import Link from "next/link";
import { notFound, redirect } from "next/navigation";

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
import { Separator } from "@/components/ui/separator";
import { getContractEntityTypes } from "@/lib/entity-config";
import { getEntityNatureLabel } from "@/lib/entity-nature";

import { toggleEntityTypeAction } from "./actions";
import { FormError } from "./form-error";

export default async function EntityTypesPage({
  params,
  searchParams,
}: {
  params: Promise<{ contractId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { contractId } = await params;
  const data = await getContractEntityTypes(contractId, session.user.id);

  if (!data) {
    notFound();
  }

  const { error } = await searchParams;

  return (
    <div className="grid max-w-5xl gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tipos de entidad</h1>
          <p className="text-sm text-muted-foreground">
            Configura las categorías de registros operacionales de este contrato.
          </p>
        </div>
        <Button asChild>
          <Link href={`/app/contracts/${contractId}/settings/entities/new`}>
            Crear tipo
          </Link>
        </Button>
      </header>

      <FormError message={error} />

      <section className="grid gap-3">
        {data.entityTypes.length > 0 ? (
          data.entityTypes.map((entityType) => (
            <Card key={entityType.id}>
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      <EntityIcon className="text-muted-foreground" icon={entityType.icon} />
                      {entityType.name}
                    </CardTitle>
                    <CardDescription>{entityType.slug}</CardDescription>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-medium">
                      {getEntityNatureLabel(entityType.nature)}
                    </span>
                    <span className="rounded-md border border-border px-2 py-1 text-xs font-medium">
                      {entityType.isActive ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-4">
                  <div>
                    Campos:{" "}
                    <span className="font-medium text-foreground">
                      {entityType._count.fields}
                    </span>
                  </div>
                  <div>
                    Naturaleza:{" "}
                    <span className="font-medium text-foreground">
                      {getEntityNatureLabel(entityType.nature)}
                    </span>
                  </div>
                  <div>
                    Actualizado:{" "}
                    <span className="font-medium text-foreground">
                      {entityType.updatedAt.toLocaleDateString("es-CL")}
                    </span>
                  </div>
                  <div>
                    Estado:{" "}
                    <span className="font-medium text-foreground">
                      {entityType.isActive ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                </div>
                <Separator />
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/app/contracts/${contractId}/settings/entities/${entityType.id}`}
                    >
                      Editar y configurar campos
                    </Link>
                  </Button>
                  <form
                    action={toggleEntityTypeAction.bind(
                      null,
                      contractId,
                      entityType.id,
                      !entityType.isActive,
                    )}
                  >
                    <Button size="sm" type="submit" variant="ghost">
                      {entityType.isActive ? "Desactivar" : "Activar"}
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Todavía no hay tipos de entidad configurados.
              </p>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
