import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { EntityIcon } from "@/components/entity-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getAppViewAdminData,
  getAppViewTypeLabel,
  parseAppViewConfig,
  summarizeAppViewConfig,
} from "@/lib/app-views";

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
    <div className="grid max-w-5xl gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Experiencias</h1>
          <p className="text-sm text-muted-foreground">
            Configura las vistas que Opco Client podrá consumir en etapas posteriores.
          </p>
        </div>
        <Button asChild>
          <Link href={`/app/contracts/${contractId}/settings/views/new`}>
            Crear experiencia
          </Link>
        </Button>
      </header>

      <ActionMessage error={error} notice={notice} />

      <section className="grid gap-3">
        {data.appViews.length > 0 ? (
          data.appViews.map((view) => {
            const config = parseAppViewConfig(view);

            return (
              <Card key={view.id}>
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2">
                        <EntityIcon className="text-muted-foreground" icon={view.icon} />
                        {view.name}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">{view.slug}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-medium">
                        {getAppViewTypeLabel(view.type)}
                      </span>
                      <span className="rounded-md border border-border px-2 py-1 text-xs font-medium">
                        {view.active ? "Activa" : "Inactiva"}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                    <div>
                      Entidades:{" "}
                      <span className="font-medium text-foreground">
                        {summarizeAppViewConfig({ config, entityTypes: data.entityTypes })}
                      </span>
                    </div>
                    <div>
                      Orden:{" "}
                      <span className="font-medium text-foreground">{view.sortOrder}</span>
                    </div>
                    <div>
                      Estado:{" "}
                      <span className="font-medium text-foreground">
                        {view.active ? "Activa" : "Inactiva"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
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
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Todavía no hay experiencias configuradas.
              </p>
            </CardContent>
          </Card>
        )}
      </section>
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
        <p className="text-sm text-muted-foreground">{error ?? notice}</p>
      </CardContent>
    </Card>
  );
}
