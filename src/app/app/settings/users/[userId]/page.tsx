import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Power, PowerOff, Save, Trash2 } from "lucide-react";

import { auth } from "@/auth";
import { EntityIcon } from "@/components/entity-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getEditableUserForAdmin,
  isPrismaConnectivityError,
  isUserAdminDatabaseConnectionError,
} from "@/lib/user-admin";

import {
  deleteUserAction,
  setUserActiveAction,
  updateUserAction,
  updateUserExperiencesAction,
} from "../actions";
import { UserAdminDatabaseConnectionState } from "../database-connection-state";
import { UserForm } from "../user-form";

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { userId } = await params;
  const { error, notice } = await searchParams;
  let data: Awaited<ReturnType<typeof getEditableUserForAdmin>> | null = null;
  let databaseConnectionFailed = false;

  try {
    data = await getEditableUserForAdmin({
      adminUserId: session.user.id,
      userId,
    });
  } catch (loadError) {
    if (
      isUserAdminDatabaseConnectionError(loadError) ||
      isPrismaConnectivityError(loadError)
    ) {
      console.error("[user-admin] Failed to load editable user.", loadError);
      databaseConnectionFailed = true;
    } else {
      throw loadError;
    }
  }

  if (databaseConnectionFailed) {
    return (
      <main className="mx-auto grid min-h-screen w-full max-w-5xl gap-6 px-6 py-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Usuario</h1>
            <p className="text-sm text-muted-foreground">
              Edita datos, estado, rol y experiencias asignadas.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/app/settings/users">Volver</Link>
          </Button>
        </header>

        <ActionMessage error={error} notice={notice} />
        <UserAdminDatabaseConnectionState retryHref={`/app/settings/users/${userId}`} />
      </main>
    );
  }

  if (!data) {
    notFound();
  }

  const user = data.membership.user;
  const userLabel = user.name ?? user.email;
  const editPath = `/app/settings/users/${user.id}`;
  const deleteConfirmation = `Eliminar definitivamente a ${userLabel}`;

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-5xl gap-6 px-6 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{userLabel}</h1>
          <p className="text-sm text-muted-foreground">
            Edita datos, estado, rol y experiencias asignadas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button asChild variant="outline">
            <Link href="/app/settings/users">Volver</Link>
          </Button>
          <form action={setUserActiveAction.bind(null, user.id, !user.active)}>
            <input name="returnTo" type="hidden" value={editPath} />
            <Button type="submit" variant="outline">
              {user.active ? (
                <PowerOff aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Power aria-hidden="true" className="h-4 w-4" />
              )}
              {user.active ? "Desactivar" : "Activar"}
            </Button>
          </form>
        </div>
      </header>

      <ActionMessage error={error} notice={notice} />

      <UserForm
        action={updateUserAction.bind(null, user.id)}
        passwordLabel="Cambiar contraseña"
        returnTo={editPath}
        submitLabel="Guardar cambios"
        successTo={editPath}
        title="Datos y acceso"
        values={{
          active: user.active,
          email: user.email,
          name: user.name,
          role: data.membership.role,
        }}
      />

      <section className="grid gap-4">
        <div>
          <h2 className="text-lg font-semibold">Experiencias</h2>
          <p className="text-sm text-muted-foreground">
            Asigna las AppViews disponibles por contrato.
          </p>
        </div>
        {data.contracts.length > 0 ? (
          data.contracts.map((contract) => (
            <Card key={contract.id}>
              <CardHeader>
                <CardTitle>{contract.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  action={updateUserExperiencesAction.bind(null, user.id)}
                  className="grid gap-4"
                >
                  <input name="contractId" type="hidden" value={contract.id} />
                  <input name="returnTo" type="hidden" value={editPath} />
                  {contract.appViews.length > 0 ? (
                    <div className="grid gap-3">
                      {contract.appViews.map((view) => (
                        <label
                          className="grid gap-3 rounded-md border border-border p-3 text-sm sm:grid-cols-[auto_1fr_auto] sm:items-center"
                          key={view.id}
                        >
                          <input
                            className="h-4 w-4"
                            defaultChecked={view.assigned}
                            disabled={!view.active}
                            name="appViewIds"
                            type="checkbox"
                            value={view.id}
                          />
                          <span className="grid gap-1">
                            <span className="flex items-center gap-2 font-medium">
                              <EntityIcon className="text-muted-foreground" icon={view.icon} />
                              {view.name}
                            </span>
                            <span className="text-muted-foreground">{view.summary}</span>
                          </span>
                          <span className="flex flex-wrap gap-2 sm:justify-end">
                            <Badge>{view.typeLabel}</Badge>
                            <Badge>{view.active ? "Activa" : "Inactiva"}</Badge>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Este contrato no tiene experiencias configuradas.
                    </p>
                  )}
                  <div className="flex justify-end">
                    <Button disabled={contract.appViews.length === 0} type="submit">
                      <Save aria-hidden="true" className="h-4 w-4" />
                      Guardar experiencias
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                No hay contratos disponibles para asignar experiencias.
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      <Card id="delete-user">
        <CardHeader>
          <CardTitle>Eliminar definitivamente</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {data.canDelete ? (
            <form action={deleteUserAction.bind(null, user.id)} className="grid gap-3">
              <input name="returnTo" type="hidden" value={editPath} />
              <input name="successTo" type="hidden" value="/app/settings/users" />
              <p className="text-sm text-muted-foreground">
                Esta acción es permanente. Escribe exactamente: {deleteConfirmation}
              </p>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
                name="confirmationText"
                required
              />
              <div className="flex justify-end">
                <Button
                  className="border border-destructive bg-background text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  type="submit"
                  variant="outline"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                  Eliminar definitivamente
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">{data.deleteBlockedReason}</p>
          )}
        </CardContent>
      </Card>
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
    <span className="rounded-md border border-border px-2 py-1 text-xs font-medium">
      {children}
    </span>
  );
}
