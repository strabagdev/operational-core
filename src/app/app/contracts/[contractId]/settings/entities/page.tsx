import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  ActionMessage,
  EmptyState,
  PageHeader,
  StatusBadge,
  SummaryCard,
} from "@/components/admin-ui";
import { EntityIcon } from "@/components/entity-icon";
import { Button } from "@/components/ui/button";
import { getContractEntityTypes } from "@/lib/entity-config";
import { getEntityNatureLabel } from "@/lib/entity-nature";

import { toggleEntityTypeAction } from "./actions";

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
    <div className="grid w-full gap-6 xl:max-w-6xl">
      <PageHeader
        actions={(
          <Button asChild>
            <Link href={`/app/contracts/${contractId}/settings/entities/new`}>
              Crear tipo
            </Link>
          </Button>
        )}
        description="Configura las categorías de registros operacionales de este contrato."
        metadata={<StatusBadge variant="info">{data.entityTypes.length} tipo{data.entityTypes.length === 1 ? "" : "s"}</StatusBadge>}
        title="Tipos de entidad"
      />

      <ActionMessage variant="error">{error}</ActionMessage>

      <section className="grid gap-3 lg:grid-cols-2">
        {data.entityTypes.length > 0 ? (
          data.entityTypes.map((entityType) => (
            <SummaryCard
              actions={(
                <>
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
                </>
              )}
              badges={(
                <>
                  <StatusBadge variant={entityNatureVariant(entityType.nature)}>
                    {getEntityNatureLabel(entityType.nature)}
                  </StatusBadge>
                  <StatusBadge variant={entityType.isActive ? "active" : "inactive"}>
                    {entityType.isActive ? "Activo" : "Inactivo"}
                  </StatusBadge>
                </>
              )}
              description={entityType.slug}
              icon={<EntityIcon icon={entityType.icon} />}
              key={entityType.id}
              metadata={[
                { label: "Campos", value: entityType._count.fields },
                { label: "Naturaleza", value: getEntityNatureLabel(entityType.nature) },
                { label: "Actualizado", value: entityType.updatedAt.toLocaleDateString("es-CL") },
                { label: "Estado", value: entityType.isActive ? "Activo" : "Inactivo" },
              ]}
              title={entityType.name}
            />
          ))
        ) : (
          <div className="lg:col-span-2">
            <EmptyState
              action={(
                <Button asChild variant="outline">
                  <Link href={`/app/contracts/${contractId}/settings/entities/new`}>
                    Crear tipo
                  </Link>
                </Button>
              )}
              description="Crea el primer tipo para comenzar a registrar información operacional."
              title="Todavía no hay tipos de entidad configurados."
            />
          </div>
        )}
      </section>
    </div>
  );
}

function entityNatureVariant(nature: string) {
  if (nature === "MASTER") return "info";
  if (nature === "TRANSACTION") return "warning";
  return "neutral";
}
