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
import {
  appViewConfigDiagnostic,
  getAppViewAdminData,
  getAppViewTypeLabel,
  isExpectedAppViewConfigParseError,
  logAppViewConfigDiagnostic,
  parseAppViewConfig,
  summarizeAppViewConfig,
} from "@/lib/app-views";

import { DiagnosticReferenceCopyButton } from "./diagnostic-reference-copy-button";
import { toggleAppViewAction } from "./actions";

export default async function AppViewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ contractId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { contractId } = await params;
  const data = await getAppViewAdminData(contractId, session.user.id);

  if (!data) {
    notFound();
  }

  const { error, notice } = await searchParams;

  return (
    <div className="grid w-full gap-6 xl:max-w-6xl">
      <PageHeader
        actions={(
          <>
          <Button asChild variant="outline">
            <Link href={`/app/contracts/${contractId}/settings/views/access`}>
              Asignar usuarios
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/app/contracts/${contractId}/settings/views/new`}>
              Crear experiencia
            </Link>
          </Button>
          </>
        )}
        description="Configura las vistas que Opco Client podrá consumir en etapas posteriores."
        metadata={<StatusBadge variant="info">{data.appViews.length} experiencia{data.appViews.length === 1 ? "" : "s"}</StatusBadge>}
        title="Experiencias"
      />

      <ActionMessage variant={error ? "error" : "info"}>{error ?? notice}</ActionMessage>

      <section className="grid gap-3 lg:grid-cols-2">
        {data.appViews.length > 0 ? (
          data.appViews.map((view) => {
            let config: ReturnType<typeof parseAppViewConfig> | null = null;
            let invalidDiagnostic: ReturnType<typeof appViewConfigDiagnostic> = null;

            try {
              config = parseAppViewConfig(view);
            } catch (error) {
              if (!isExpectedAppViewConfigParseError(error)) {
                throw error;
              }

              invalidDiagnostic = appViewConfigDiagnostic({ error, view });

              if (invalidDiagnostic) {
                logAppViewConfigDiagnostic({ diagnostic: invalidDiagnostic, view });
              }
            }

            if (!config && invalidDiagnostic) {
              return (
                <SummaryCard
                  actions={(
                    <>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/app/contracts/${contractId}/settings/views/${view.id}`}>
                          Revisar
                        </Link>
                      </Button>
                      <DiagnosticReferenceCopyButton reference={invalidDiagnostic.reference} />
                    </>
                  )}
                  badges={(
                    <>
                      <StatusBadge variant={appViewTypeVariant(view.type)}>
                        {getAppViewTypeLabel(view.type)}
                      </StatusBadge>
                      <StatusBadge variant="warning">
                        Configuración incompatible o inválida
                      </StatusBadge>
                    </>
                  )}
                  description={view.slug}
                  icon={<EntityIcon icon={view.icon} />}
                  key={view.id}
                  metadata={[
                    { label: "Entidades", value: "No disponible" },
                    { label: "Orden", value: view.sortOrder },
                    { label: "Estado", value: "Configuración incompatible o inválida" },
                    { label: "Detalle", value: invalidDiagnostic.explanation },
                  ]}
                  title={view.name}
                />
              );
            }

            if (!config) {
              throw new Error("Expected parsed AppView config.");
            }

            return (
              <SummaryCard
                actions={(
                  <>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/app/contracts/${contractId}/settings/views/${view.id}`}>
                        Editar
                      </Link>
                    </Button>
                    <form
                      action={toggleAppViewAction.bind(
                        null,
                        contractId,
                        view.id,
                        !view.active,
                      )}
                    >
                      <Button size="sm" type="submit" variant="ghost">
                        {view.active ? "Desactivar" : "Activar"}
                      </Button>
                    </form>
                  </>
                )}
                badges={(
                  <>
                    <StatusBadge variant={appViewTypeVariant(view.type)}>
                      {getAppViewTypeLabel(view.type)}
                    </StatusBadge>
                    <StatusBadge variant={view.active ? "active" : "inactive"}>
                      {view.active ? "Activa" : "Inactiva"}
                    </StatusBadge>
                  </>
                )}
                description={view.slug}
                icon={<EntityIcon icon={view.icon} />}
                key={view.id}
                metadata={[
                  { label: "Entidades", value: summarizeAppViewConfig({ config, entityTypes: data.entityTypes }) },
                  { label: "Orden", value: view.sortOrder },
                  { label: "Estado", value: view.active ? "Activa" : "Inactiva" },
                ]}
                title={view.name}
              />
            );
          })
        ) : (
          <div className="lg:col-span-2">
            <EmptyState
              action={(
                <Button asChild variant="outline">
                  <Link href={`/app/contracts/${contractId}/settings/views/new`}>
                    Crear experiencia
                  </Link>
                </Button>
              )}
              description="Crea una experiencia para que Opco Client pueda consumirla."
              title="Todavía no hay experiencias configuradas."
            />
          </div>
        )}
      </section>
    </div>
  );
}

function appViewTypeVariant(type: string) {
  if (type === "PANEL") return "info";
  if (type === "WORKFLOW") return "warning";
  if (type === "DASHBOARD") return "active";
  return "neutral";
}
