import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Edit, Power, PowerOff, Trash2 } from "lucide-react";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getUserAdministration,
  isPrismaConnectivityError,
  isUserAdminDatabaseConnectionError,
} from "@/lib/user-admin";

import { setUserActiveAction } from "./actions";
import { UserAdminDatabaseConnectionState } from "./database-connection-state";

export default async function UserAdministrationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { error, notice } = await searchParams;
  let data: Awaited<ReturnType<typeof getUserAdministration>> | null = null;
  let databaseConnectionFailed = false;

  try {
    data = await getUserAdministration({ userId: session.user.id });
  } catch (loadError) {
    if (
      isUserAdminDatabaseConnectionError(loadError) ||
      isPrismaConnectivityError(loadError)
    ) {
      console.error("[user-admin] Failed to load user administration.", loadError);
      databaseConnectionFailed = true;
    } else {
      throw loadError;
    }
  }

  if (!databaseConnectionFailed && !data?.organization) {
    notFound();
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl gap-6 px-6 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            Administra usuarios, estado, roles y experiencias de tu organización.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button asChild variant="outline">
            <Link href="/app">Volver</Link>
          </Button>
          <Button asChild>
            <Link href="/app/settings/users/new">Nuevo usuario</Link>
          </Button>
        </div>
      </header>

      <ActionMessage error={error} notice={notice} />

      {databaseConnectionFailed ? (
        <UserAdminDatabaseConnectionState retryHref="/app/settings/users" />
      ) : data?.organization ? (
        <section className="grid gap-3">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead className="bg-muted/40 text-left text-xs font-medium uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Rol</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Experiencias asignadas</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.users.length > 0 ? (
                  data.users.map((user) => (
                    <tr className="border-t border-border" key={user.id}>
                      <td className="px-4 py-3 font-medium">
                        {user.name ?? "Usuario sin nombre"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                      <td className="px-4 py-3">
                        <Badge>{user.role}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge>{user.active ? "Activo" : "Inactivo"}</Badge>
                      </td>
                      <td className="max-w-[320px] px-4 py-3 text-muted-foreground">
                        {user.appViewAccesses.length > 0
                          ? user.appViewAccesses
                              .map((access) => `${access.contract.name}: ${access.appView.name}`)
                              .join(", ")
                          : "Sin experiencias"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button asChild size="icon" title="Ver / Editar" variant="outline">
                            <Link href={`/app/settings/users/${user.id}`}>
                              <Edit aria-hidden="true" className="h-4 w-4" />
                            </Link>
                          </Button>
                          <form action={setUserActiveAction.bind(null, user.id, !user.active)}>
                            <input name="returnTo" type="hidden" value="/app/settings/users" />
                            <Button
                              size="icon"
                              title={user.active ? "Desactivar" : "Activar"}
                              type="submit"
                              variant="outline"
                            >
                              {user.active ? (
                                <PowerOff aria-hidden="true" className="h-4 w-4" />
                              ) : (
                                <Power aria-hidden="true" className="h-4 w-4" />
                              )}
                            </Button>
                          </form>
                          <Button asChild size="icon" title="Eliminar" variant="outline">
                            <Link href={`/app/settings/users/${user.id}#delete-user`}>
                              <Trash2 aria-hidden="true" className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                      No hay usuarios en esta organización.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              No tienes permisos para administrar usuarios.
            </p>
          </CardContent>
        </Card>
      )}
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
