import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "@/auth";
import {
  EmptyState,
  PageHeader,
  StatusBadge,
  SummaryCard,
} from "@/components/admin-ui";
import { EntityIcon } from "@/components/entity-icon";
import { Button } from "@/components/ui/button";
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
      <PageHeader
        description="Fuente operacional del contrato organizada por tipo de entidad."
        metadata={<StatusBadge variant="info">{data.entityTypes.length} tipo{data.entityTypes.length === 1 ? "" : "s"} activo{data.entityTypes.length === 1 ? "" : "s"}</StatusBadge>}
        title="Registros"
      />

      {data.entityTypes.length > 0 ? (
        <div className="grid gap-6">
          {groupedEntityTypes.map((group) => (
            <section className="grid gap-3" key={group.value}>
              <header className="flex flex-wrap items-center gap-3 border-b border-border pb-1.5">
                <h2 className="text-base font-semibold">{group.title}</h2>
                <StatusBadge variant={entityNatureVariant(group.value)}>
                  {group.entityTypes.length}
                </StatusBadge>
              </header>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {group.entityTypes.map((entityType) => (
                  <SummaryCard
                    actions={(
                      <Button asChild className="h-8 px-3 text-xs" size="sm" variant="outline">
                        <Link href={`/app/contracts/${contractId}/records/${entityType.id}`}>
                          Abrir
                        </Link>
                      </Button>
                    )}
                    badges={(
                      <StatusBadge variant={entityNatureVariant(entityType.nature)}>
                        {getEntityNatureLabel(entityType.nature)}
                      </StatusBadge>
                    )}
                    description={entityType.description}
                    icon={<EntityIcon icon={entityType.icon} />}
                    key={entityType.id}
                    metadata={[
                      { label: "Registros", value: entityType._count.records },
                    ]}
                    title={entityType.name}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          description="Configura o activa tipos de entidad para comenzar a registrar información."
          title="No hay tipos de entidad activos para registrar."
        />
      )}
    </div>
  );
}

function entityNatureVariant(nature: string) {
  if (nature === "MASTER") return "info";
  if (nature === "TRANSACTION") return "warning";
  return "neutral";
}
