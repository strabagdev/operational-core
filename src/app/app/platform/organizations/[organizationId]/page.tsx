import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Edit, Power, PowerOff } from "lucide-react";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildPlatformOrganizationsHref,
  getActivePlatformOrganizationModal,
  type PlatformOrganizationSearchParams,
} from "@/lib/platform-organization-navigation";
import { getPlatformOrganization } from "@/lib/platform-organization-admin";
import { PlatformAuthError } from "@/lib/platform-auth";

import {
  setOrganizationActiveAction,
  updateOrganizationAction,
} from "../actions";
import { DeactivateOrganizationDialog } from "../deactivate-organization-dialog";
import { OrganizationFormSheet } from "../organization-form-sheet";

export default async function PlatformOrganizationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<PlatformOrganizationSearchParams>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { organizationId } = await params;
  const currentParams = await searchParams;
  let organization: Awaited<ReturnType<typeof getPlatformOrganization>>;

  try {
    organization = await getPlatformOrganization(session.user.id, organizationId);
  } catch (error) {
    if (error instanceof PlatformAuthError) {
      notFound();
    }

    throw error;
  }

  if (!organization) {
    notFound();
  }

  const basePath = `/app/platform/organizations/${organization.id}`;
  const listPath = "/app/platform/organizations";
  const closeHref = buildPlatformOrganizationsHref(basePath, currentParams, {
    deactivateOrganization: undefined,
    editOrganization: undefined,
    error: undefined,
  });
  const activeModal = getActivePlatformOrganizationModal(currentParams);
  const adminMemberships = organization.memberships.filter((membership) => membership.role === "ADMIN");

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl gap-6 px-6 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{organization.name}</h1>
          <p className="text-sm text-muted-foreground">
            Vista global de organización sin impersonation ni memberships automáticos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button asChild variant="outline">
            <Link href={listPath}>Volver</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={buildPlatformOrganizationsHref(basePath, currentParams, {
              deactivateOrganization: undefined,
              editOrganization: organization.id,
              error: undefined,
              notice: undefined,
            })}>
              <Edit aria-hidden="true" className="h-4 w-4" />
              Editar
            </Link>
          </Button>
          {organization.active ? (
            <Button asChild variant="outline">
              <Link href={buildPlatformOrganizationsHref(basePath, currentParams, {
                deactivateOrganization: organization.id,
                editOrganization: undefined,
                error: undefined,
                notice: undefined,
              })}>
                <PowerOff aria-hidden="true" className="h-4 w-4" />
                Desactivar
              </Link>
            </Button>
          ) : (
            <form action={setOrganizationActiveAction.bind(null, organization.id, true)}>
              <input name="returnTo" type="hidden" value={closeHref} />
              <Button type="submit" variant="outline">
                <Power aria-hidden="true" className="h-4 w-4" />
                Activar
              </Button>
            </form>
          )}
        </div>
      </header>

      <ActionMessage error={currentParams.error} notice={currentParams.notice} />

      <section className="grid gap-3 md:grid-cols-4">
        <SummaryItem label="Slug" value={organization.slug} />
        <SummaryItem label="Estado" value={organization.active ? "Activa" : "Inactiva"} />
        <SummaryItem label="Creada" value={organization.createdAt.toLocaleDateString("es-CL")} />
        <SummaryItem label="Actualizada" value={organization.updatedAt.toLocaleDateString("es-CL")} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Contratos</CardTitle>
          </CardHeader>
          <CardContent>
            {organization.contracts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead className="bg-muted/40 text-left text-xs font-medium uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Nombre</th>
                      <th className="px-3 py-2">Código</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Actualizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {organization.contracts.map((contract) => (
                      <tr className="border-t border-border" key={contract.id}>
                        <td className="px-3 py-2 font-medium">{contract.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{contract.code}</td>
                        <td className="px-3 py-2"><Badge>{contract.status}</Badge></td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {contract.updatedAt.toLocaleDateString("es-CL")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No hay contratos en esta organización.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Admins</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {adminMemberships.length > 0 ? (
              adminMemberships.map((membership) => (
                <UserLine key={membership.id} role={membership.role} user={membership.user} />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Sin admins registrados.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Usuarios</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {organization.memberships.length > 0 ? (
              organization.memberships.map((membership) => (
                <UserLine key={membership.id} role={membership.role} user={membership.user} />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Sin usuarios registrados.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aplicaciones externas</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {organization.externalApps.length > 0 ? (
              organization.externalApps.map((app) => (
                <div className="grid gap-1 rounded-md border border-border p-3 text-sm" key={app.id}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{app.name}</span>
                    <Badge>{app.active ? "Activa" : "Inactiva"}</Badge>
                  </div>
                  <span className="text-muted-foreground">{app.slug}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Sin aplicaciones externas.</p>
            )}
          </CardContent>
        </Card>
      </section>

      {activeModal.type === "edit" ? (
        <OrganizationFormSheet
          action={updateOrganizationAction.bind(null, organization.id)}
          closeHref={closeHref}
          organization={organization}
          returnTo={buildPlatformOrganizationsHref(basePath, currentParams, {
            editOrganization: organization.id,
            error: undefined,
            notice: undefined,
          })}
          successTo={closeHref}
        />
      ) : null}
      {activeModal.type === "deactivate" ? (
        <DeactivateOrganizationDialog
          action={setOrganizationActiveAction.bind(null, organization.id, false)}
          closeHref={closeHref}
          organizationName={organization.name}
          returnTo={closeHref}
        />
      ) : null}
    </main>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="grid gap-1 pt-6">
        <span className="text-xs font-medium uppercase text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold">{value}</span>
      </CardContent>
    </Card>
  );
}

function UserLine({
  role,
  user,
}: {
  role: string;
  user: {
    active: boolean;
    email: string;
    name: string | null;
    platformRole?: string | null;
  };
}) {
  return (
    <div className="grid gap-1 rounded-md border border-border p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{user.name ?? user.email}</span>
        <div className="flex gap-2">
          <Badge>{role}</Badge>
          <Badge>{user.active ? "Activo" : "Inactivo"}</Badge>
        </div>
      </div>
      <span className="text-muted-foreground">{user.email}</span>
      {user.platformRole === "PLATFORM_ADMIN" ? (
        <span className="text-xs text-muted-foreground">PLATFORM_ADMIN</span>
      ) : null}
    </div>
  );
}

function ActionMessage({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) {
    return null;
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <p className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {error ?? notice}
        </p>
      </CardContent>
    </Card>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-md border border-border px-2 py-1 text-xs font-medium">
      {children}
    </span>
  );
}
