import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Edit, Eye, Power, PowerOff } from "lucide-react";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  buildPlatformOrganizationsHref,
  getActivePlatformOrganizationModal,
  type PlatformOrganizationSearchParams,
} from "@/lib/platform-organization-navigation";
import { getPlatformOrganizations } from "@/lib/platform-organization-admin";
import { PlatformAuthError } from "@/lib/platform-auth";

import {
  createOrganizationAction,
  setOrganizationActiveAction,
  updateOrganizationAction,
} from "./actions";
import { DeactivateOrganizationDialog } from "./deactivate-organization-dialog";
import { OrganizationFormSheet } from "./organization-form-sheet";

export default async function PlatformOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<PlatformOrganizationSearchParams>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const basePath = "/app/platform/organizations";
  let organizations: Awaited<ReturnType<typeof getPlatformOrganizations>>;

  try {
    organizations = await getPlatformOrganizations(session.user.id);
  } catch (error) {
    if (error instanceof PlatformAuthError) {
      notFound();
    }

    throw error;
  }

  const closeHref = buildPlatformOrganizationsHref(basePath, params, {
    createOrganization: undefined,
    deactivateOrganization: undefined,
    editOrganization: undefined,
    error: undefined,
  });
  const createHref = buildPlatformOrganizationsHref(basePath, params, {
    createOrganization: "1",
    deactivateOrganization: undefined,
    editOrganization: undefined,
    error: undefined,
    notice: undefined,
  });
  const activeModal = getActivePlatformOrganizationModal(params);
  const editingOrganization = activeModal.type === "edit"
    ? organizations.find((organization) => organization.id === activeModal.organizationId)
    : undefined;
  const deactivatingOrganization = activeModal.type === "deactivate"
    ? organizations.find((organization) => organization.id === activeModal.organizationId)
    : undefined;

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl gap-6 px-6 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Organizaciones</h1>
          <p className="text-sm text-muted-foreground">
            Administra organizaciones desde el nivel global de plataforma.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button asChild variant="outline">
            <Link href="/app">Volver</Link>
          </Button>
          <Button asChild>
            <Link href={createHref}>Nueva organización</Link>
          </Button>
        </div>
      </header>

      <ActionMessage error={params.error} notice={params.notice} />

      <section className="grid gap-3">
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead className="bg-muted/40 text-left text-xs font-medium uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Organización</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Contratos</th>
                <th className="px-4 py-3">Usuarios</th>
                <th className="px-4 py-3">Admins</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {organizations.length > 0 ? (
                organizations.map((organization) => (
                  <tr className="border-t border-border" key={organization.id}>
                    <td className="px-4 py-3 font-medium">{organization.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{organization.slug}</td>
                    <td className="px-4 py-3">
                      <Badge>{organization.active ? "Activa" : "Inactiva"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{organization.contractCount}</td>
                    <td className="px-4 py-3 text-muted-foreground">{organization.membershipCount}</td>
                    <td className="max-w-[260px] px-4 py-3 text-muted-foreground">
                      {organization.adminUsers.length > 0
                        ? organization.adminUsers
                            .map((user) => user.name ?? user.email)
                            .join(", ")
                        : "Sin admins"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button asChild size="icon" title="Ver organización" variant="outline">
                          <Link href={`${basePath}/${organization.id}`}>
                            <Eye aria-hidden="true" className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button asChild size="icon" title="Editar" variant="outline">
                          <Link href={buildPlatformOrganizationsHref(basePath, params, {
                            createOrganization: undefined,
                            deactivateOrganization: undefined,
                            editOrganization: organization.id,
                            error: undefined,
                            notice: undefined,
                          })}>
                            <Edit aria-hidden="true" className="h-4 w-4" />
                          </Link>
                        </Button>
                        {organization.active ? (
                          <Button asChild size="icon" title="Desactivar" variant="outline">
                            <Link href={buildPlatformOrganizationsHref(basePath, params, {
                              createOrganization: undefined,
                              deactivateOrganization: organization.id,
                              editOrganization: undefined,
                              error: undefined,
                              notice: undefined,
                            })}>
                              <PowerOff aria-hidden="true" className="h-4 w-4" />
                            </Link>
                          </Button>
                        ) : (
                          <form action={setOrganizationActiveAction.bind(null, organization.id, true)}>
                            <input name="returnTo" type="hidden" value={closeHref} />
                            <Button size="icon" title="Activar" type="submit" variant="outline">
                              <Power aria-hidden="true" className="h-4 w-4" />
                            </Button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={7}>
                    No hay organizaciones registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {activeModal.type === "create" ? (
        <OrganizationFormSheet
          action={createOrganizationAction}
          closeHref={closeHref}
          returnTo={createHref}
          successTo={closeHref}
        />
      ) : null}
      {editingOrganization ? (
        <OrganizationFormSheet
          action={updateOrganizationAction.bind(null, editingOrganization.id)}
          closeHref={closeHref}
          organization={editingOrganization}
          returnTo={buildPlatformOrganizationsHref(basePath, params, {
            editOrganization: editingOrganization.id,
            error: undefined,
            notice: undefined,
          })}
          successTo={closeHref}
        />
      ) : null}
      {deactivatingOrganization ? (
        <DeactivateOrganizationDialog
          action={setOrganizationActiveAction.bind(null, deactivatingOrganization.id, false)}
          closeHref={closeHref}
          organizationName={deactivatingOrganization.name}
          returnTo={closeHref}
        />
      ) : null}
    </main>
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
