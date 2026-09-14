import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, ExternalLink, FileStack, ShieldAlert, Users } from "lucide-react";

import { auth } from "@/auth";
import {
  ActionMessage,
  EmptyState,
  PageHeader,
  StatusBadge,
  SummaryCard,
} from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import {
  canManageContract,
  canManageExternalApps,
  canManageUsers,
} from "@/lib/capabilities";
import { userCanManageContracts } from "@/lib/contract-admin";
import { getInactiveUserOrganizations, getUserContracts } from "@/lib/contracts";
import { getPlatformNavigationItems } from "@/lib/platform-navigation";

import { AuthenticatedAppShell } from "./app-shell";

export default async function AppPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const [contracts, inactiveOrganizations, canCreateContracts] = await Promise.all([
    getUserContracts(session.user.id),
    getInactiveUserOrganizations(session.user.id),
    userCanManageContracts(session.user.id),
  ]);
  const platformNavigation = getPlatformNavigationItems(session.user.platformRole);
  const adminContract = contracts.find((contract) =>
    canManageContract({ membershipRole: contract.membershipRole }),
  );
  const adminContext = { membershipRole: adminContract?.membershipRole };

  return (
    <AuthenticatedAppShell
      userEmail={session.user.email}
      userImage={session.user.image}
      userName={session.user.name}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <PageHeader
          description="Selecciona un contrato para continuar."
          metadata={(
            <StatusBadge variant="info">
              {contracts.length} contrato{contracts.length === 1 ? "" : "s"} disponible{contracts.length === 1 ? "" : "s"}
            </StatusBadge>
          )}
          title="Operational Core"
        />

        <section className="grid gap-3">
          {platformNavigation.length > 0 ? (
            <section className="grid gap-3">
              <h2 className="text-base font-semibold">Plataforma</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {platformNavigation.map((item) => (
                  <SummaryCard
                    actions={(
                      <Button asChild variant="outline">
                        <Link href={item.href}>{item.label}</Link>
                      </Button>
                    )}
                    description="Administración global disponible para usuarios de plataforma."
                    icon={<ShieldAlert aria-hidden="true" className="h-4 w-4" />}
                    key={item.href}
                    title={item.label}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {inactiveOrganizations.length > 0 ? (
            <ActionMessage variant="warning">
              <span className="block font-medium">Esta organización se encuentra inactiva.</span>
              <span className="mt-1 block text-sm">
                {inactiveOrganizations.map((organization) => organization.name).join(", ")}
              </span>
            </ActionMessage>
          ) : null}

          {contracts.length > 0 ? (
            <section className="grid gap-3">
              <h2 className="text-base font-semibold">Contratos</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {contracts.map((contract) => (
                  <SummaryCard
                    actions={(
                      <Button asChild>
                        <Link href={`/app/contracts/${contract.id}`}>
                          Abrir contrato
                        </Link>
                      </Button>
                    )}
                    badges={(
                      <>
                        <StatusBadge variant="active">Activo</StatusBadge>
                        {canManageContract({ membershipRole: contract.membershipRole }) ? (
                          <StatusBadge variant="info">Administrador</StatusBadge>
                        ) : null}
                      </>
                    )}
                    description={contract.organization.name}
                    icon={<Building2 aria-hidden="true" className="h-4 w-4" />}
                    key={contract.id}
                    metadata={[
                      { label: "Código", value: contract.code },
                      { label: "Organización", value: contract.organization.name },
                    ]}
                    title={contract.name}
                  />
                ))}
              </div>
            </section>
          ) : (
            <EmptyState
              action={canCreateContracts ? (
                <Button asChild>
                  <Link href="/app/settings/contracts?createContract=1">
                    Crear contrato
                  </Link>
                </Button>
              ) : null}
              description="No hay contratos disponibles para tu usuario."
              title="Sin contratos disponibles"
            />
          )}

          {adminContract ? (
            <section className="grid gap-3">
              <h2 className="text-base font-semibold">Administración</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {canManageUsers(adminContext) ? (
                  <SummaryCard
                    actions={(
                      <Button asChild variant="outline">
                        <Link href="/app/settings/users">Usuarios</Link>
                      </Button>
                    )}
                    description="Administra usuarios y accesos de la organización."
                    icon={<Users aria-hidden="true" className="h-4 w-4" />}
                    title="Usuarios"
                  />
                ) : null}
                <SummaryCard
                  actions={(
                    <Button asChild variant="outline">
                      <Link href="/app/settings/contracts">Administrar contratos</Link>
                    </Button>
                  )}
                  description="Gestiona contratos disponibles para la organización."
                  icon={<FileStack aria-hidden="true" className="h-4 w-4" />}
                  title="Contratos"
                />
                {canManageExternalApps(adminContext) ? (
                  <SummaryCard
                    actions={(
                      <Button asChild variant="outline">
                        <Link href="/app/settings/apps">Aplicaciones externas</Link>
                      </Button>
                    )}
                    description="Configura aplicaciones externas autorizadas para consumir la API."
                    icon={<ExternalLink aria-hidden="true" className="h-4 w-4" />}
                    title="Aplicaciones externas"
                  />
                ) : null}
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </AuthenticatedAppShell>
  );
}
