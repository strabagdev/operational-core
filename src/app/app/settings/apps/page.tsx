import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MoreHorizontal } from "lucide-react";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  buildExternalAppsHref,
  getActiveExternalAppAdminModal,
  type ExternalAppAdminSearchParams,
} from "@/lib/external-app-admin-navigation";
import { getExternalAppAdministration } from "@/lib/external-app-admin";
import {
  createExternalAppAction,
  setExternalAppActiveAction,
  updateExternalAppAction,
} from "./actions";
import { ExternalAppFormSheet } from "./external-app-form-sheet";

export default async function ExternalAppAdministrationPage({
  searchParams,
}: {
  searchParams: Promise<ExternalAppAdminSearchParams>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const basePath = "/app/settings/apps";
  const data = await getExternalAppAdministration(session.user.id);

  if (!data.organization) {
    notFound();
  }

  const closeHref = buildExternalAppsHref(basePath, params, {
    createApp: undefined,
    editApp: undefined,
    error: undefined,
  });
  const createHref = buildExternalAppsHref(basePath, params, {
    createApp: "1",
    editApp: undefined,
    error: undefined,
    notice: undefined,
  });
  const activeModal = getActiveExternalAppAdminModal(params);
  const createOpen = activeModal.type === "create";
  const editingApp = activeModal.type === "edit"
    ? data.apps.find((app) => app.id === activeModal.appId)
    : undefined;

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl gap-6 px-6 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Aplicaciones externas</h1>
          <p className="text-sm text-muted-foreground">
            Administra las aplicaciones externas registradas para tu organización.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button asChild variant="outline">
            <Link href="/app">Volver</Link>
          </Button>
          <Button asChild>
            <Link href={createHref}>Nueva aplicación</Link>
          </Button>
        </div>
      </header>

      {params.error ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{params.error}</p>
          </CardContent>
        </Card>
      ) : null}
      {params.notice ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{params.notice}</p>
          </CardContent>
        </Card>
      ) : null}

      {data.organization ? (
        <section className="grid gap-3">
          {data.apps.length > 0 ? (
            data.apps.map((app) => (
              <Card className={app.active ? "" : "opacity-75"} key={app.id}>
                <CardContent className="grid gap-4 pt-6 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="grid gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold">{app.name}</h2>
                      <ExternalAppStatusBadge active={app.active} />
                    </div>
                    <div className="grid gap-1 text-sm text-muted-foreground md:grid-cols-2">
                      <span>Slug: {app.slug}</span>
                      <span>Client ID: {app.clientId}</span>
                      <span>Organización: {app.organization.name}</span>
                      <span>Creada: {app.createdAt.toLocaleDateString("es-CL")}</span>
                      <span>Actualizada: {app.updatedAt.toLocaleDateString("es-CL")}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label={`Más acciones para ${app.name}`}
                          size="icon"
                          variant="outline"
                        >
                          <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                        <DropdownMenuItem asChild>
                          <Link
                            href={buildExternalAppsHref(basePath, params, {
                              createApp: undefined,
                              editApp: app.id,
                              error: undefined,
                              notice: undefined,
                            })}
                          >
                            Editar
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <form action={setExternalAppActiveAction.bind(null, app.id, !app.active)}>
                            <input name="returnTo" type="hidden" value={closeHref} />
                            <button className="w-full text-left" type="submit">
                              {app.active ? "Desactivar" : "Activar"}
                            </button>
                          </form>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  No hay aplicaciones externas registradas.
                </p>
              </CardContent>
            </Card>
          )}
        </section>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              No tienes permisos para administrar aplicaciones externas.
            </p>
          </CardContent>
        </Card>
      )}

      {createOpen && data.organization ? (
        <ExternalAppFormSheet
          action={createExternalAppAction}
          closeHref={closeHref}
          returnTo={createHref}
          successTo={closeHref}
        />
      ) : null}
      {editingApp ? (
        <ExternalAppFormSheet
          action={updateExternalAppAction.bind(null, editingApp.id)}
          app={{
            active: editingApp.active,
            clientId: editingApp.clientId,
            id: editingApp.id,
            name: editingApp.name,
            slug: editingApp.slug,
          }}
          closeHref={closeHref}
          returnTo={buildExternalAppsHref(basePath, params, {
            createApp: undefined,
            editApp: editingApp.id,
            error: undefined,
            notice: undefined,
          })}
          successTo={closeHref}
        />
      ) : null}
    </main>
  );
}

function ExternalAppStatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "rounded-full border border-transparent bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
          : "rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
      }
    >
      {active ? "Activa" : "Inactiva"}
    </span>
  );
}
