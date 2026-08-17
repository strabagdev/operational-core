import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { EntityIcon } from "@/components/entity-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppViewAccessAdminData } from "@/lib/app-view-access";

import { updateAppViewAccessAction } from "./actions";

export default async function AppViewAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ contractId: string }>;
  searchParams: Promise<{ error?: string; notice?: string; userId?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { contractId } = await params;
  const { error, notice, userId } = await searchParams;
  const data = await getAppViewAccessAdminData({
    adminUserId: session.user.id,
    contractId,
    selectedUserId: userId,
  });

  if (!data) {
    notFound();
  }

  const selectedUserId = data.selectedUser?.user.id ?? "";

  return (
    <div className="grid max-w-4xl gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Asignar experiencias</h1>
          <p className="text-sm text-muted-foreground">
            Define qué experiencias puede utilizar cada usuario en este contrato.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/app/contracts/${contractId}/settings/views`}>Volver</Link>
        </Button>
      </header>

      <ActionMessage error={error} notice={notice} />

      <Card>
        <CardHeader>
          <CardTitle>Usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-2 sm:grid-cols-[1fr_auto]" method="get">
            <label className="grid gap-2 text-sm font-medium">
              Usuario
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none ring-ring focus-visible:ring-2"
                defaultValue={selectedUserId}
                name="userId"
              >
                {data.memberships.map((membership) => (
                  <option key={membership.user.id} value={membership.user.id}>
                    {membership.user.name ?? membership.user.email} · {membership.user.email}
                  </option>
                ))}
              </select>
            </label>
            <Button className="self-end" type="submit" variant="outline">
              Ver usuario
            </Button>
          </form>
        </CardContent>
      </Card>

      {data.selectedUser ? (
        <form action={updateAppViewAccessAction}>
          <input name="contractId" type="hidden" value={contractId} />
          <input name="targetUserId" type="hidden" value={data.selectedUser.user.id} />
          <Card>
            <CardHeader>
              <CardTitle>
                Experiencias de {data.selectedUser.user.name ?? data.selectedUser.user.email}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {data.appViews.length > 0 ? (
                <div className="grid gap-3">
                  {data.appViews.map((view) => {
                    const assigned = data.assignedAppViewIds.has(view.id);
                    const disabled = !view.active;

                    return (
                      <label
                        className="grid gap-3 rounded-md border border-border p-3 text-sm sm:grid-cols-[auto_1fr_auto] sm:items-center"
                        key={view.id}
                      >
                        <input
                          className="h-4 w-4"
                          defaultChecked={assigned}
                          disabled={disabled}
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
                          <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-medium">
                            {view.typeLabel}
                          </span>
                          <span className="rounded-md border border-border px-2 py-1 text-xs font-medium">
                            {view.active ? "Activa" : "Inactiva"}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Todavía no hay experiencias configuradas.
                </p>
              )}
              <Button disabled={data.appViews.length === 0} type="submit">
                Guardar asignaciones
              </Button>
            </CardContent>
          </Card>
        </form>
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
