import Link from "next/link";
import { redirect } from "next/navigation";
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
import { buildUsersHref, type UserAdminSearchParams } from "@/lib/user-admin-navigation";
import { getUserAdministration } from "@/lib/user-admin";
import {
  addUserAction,
  removeMembershipAction,
  updateMembershipRoleAction,
} from "./actions";
import { UserFormSheet } from "./user-form-sheet";

export default async function UserAdministrationPage({
  searchParams,
}: {
  searchParams: Promise<UserAdminSearchParams>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const basePath = "/app/settings/users";
  const data = await getUserAdministration({
    userId: session.user.id,
  });
  const closeHref = buildUsersHref(basePath, params, {
    addUser: undefined,
    error: undefined,
    notice: undefined,
  });
  const addHref = buildUsersHref(basePath, params, {
    addUser: "1",
    error: undefined,
    notice: undefined,
  });
  const sheetOrganizations = data.organization ? [data.organization] : [];

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl gap-6 px-6 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            Administra usuarios y roles de tu organización.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button asChild variant="outline">
            <Link href="/app">Volver</Link>
          </Button>
          <Button asChild>
            <Link href={addHref}>Agregar usuario</Link>
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
          {data.memberships.length > 0 ? (
            data.memberships.map((membership) => {
              const nextRole = membership.role === "ADMIN" ? "MEMBER" : "ADMIN";

              return (
                <Card key={membership.id}>
                  <CardContent className="grid gap-4 pt-6 md:grid-cols-[1fr_auto] md:items-center">
                    <div className="grid gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold">
                          {membership.user.name ?? "Usuario sin nombre"}
                        </h2>
                        <span className="rounded-md border border-border px-2 py-1 text-xs font-medium">
                          {membership.role}
                        </span>
                        <span className="rounded-md border border-border px-2 py-1 text-xs font-medium">
                          Activo
                        </span>
                      </div>
                      <div className="grid gap-1 text-sm text-muted-foreground md:grid-cols-2">
                        <span>Email: {membership.user.email}</span>
                        <span>Organización: {data.organization.name}</span>
                        <span>
                          Incorporación: {membership.createdAt.toLocaleDateString("es-CL")}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-label={`Más acciones para ${membership.user.email}`}
                            size="icon"
                            variant="outline"
                          >
                            <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                          <DropdownMenuItem asChild>
                            <form
                              action={updateMembershipRoleAction.bind(
                                null,
                                membership.id,
                                nextRole,
                              )}
                            >
                              <input name="returnTo" type="hidden" value={closeHref} />
                              <button className="w-full text-left" type="submit">
                                Cambiar a {nextRole}
                              </button>
                            </form>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <form action={removeMembershipAction.bind(null, membership.id)}>
                              <input name="returnTo" type="hidden" value={closeHref} />
                              <button className="w-full text-left text-destructive" type="submit">
                                Quitar de la organización
                              </button>
                            </form>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  No hay usuarios en esta organización.
                </p>
              </CardContent>
            </Card>
          )}
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

      {params.addUser === "1" && sheetOrganizations.length > 0 ? (
        <UserFormSheet
          action={addUserAction}
          closeHref={closeHref}
          organizations={sheetOrganizations}
          returnTo={addHref}
          successTo={closeHref}
        />
      ) : null}
    </main>
  );
}
