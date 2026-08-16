import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthorizedAppView, parseAppViewConfig } from "@/lib/app-views";

import { updateAppViewAction } from "../actions";
import { AppViewForm } from "../app-view-form";

export default async function AppViewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ appViewId: string; contractId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { appViewId, contractId } = await params;
  const data = await getAuthorizedAppView(contractId, appViewId, session.user.id);

  if (!data) {
    notFound();
  }

  const { error, notice } = await searchParams;

  return (
    <div className="grid max-w-3xl gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{data.appView.name}</h1>
          <p className="text-sm text-muted-foreground">
            Configuración de experiencia para Opco Client.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/app/contracts/${contractId}/settings/views`}>Volver</Link>
        </Button>
      </header>

      <ActionMessage error={error} notice={notice} />

      <Card>
        <CardHeader>
          <CardTitle>Datos de la experiencia</CardTitle>
        </CardHeader>
        <CardContent>
          <AppViewForm
            action={updateAppViewAction.bind(null, contractId, appViewId)}
            entityTypes={data.entityTypes}
            initialValues={{
              active: data.appView.active,
              config: parseAppViewConfig(data.appView),
              icon: data.appView.icon,
              name: data.appView.name,
              slug: data.appView.slug,
              sortOrder: data.appView.sortOrder,
              type: data.appView.type,
            }}
            submitLabel="Guardar experiencia"
          />
        </CardContent>
      </Card>
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
