import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppViewAdminData } from "@/lib/app-views";

import { createAppViewAction } from "../actions";
import { AppViewForm } from "../app-view-form";

export default async function NewAppViewPage({
  params,
}: {
  params: Promise<{ contractId: string }>;
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

  return (
    <div className="grid max-w-3xl gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Crear experiencia</h1>
          <p className="text-sm text-muted-foreground">
            Define cómo una o más entidades se presentarán en Opco Client.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/app/contracts/${contractId}/settings/views`}>Volver</Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Datos de la experiencia</CardTitle>
        </CardHeader>
        <CardContent>
          <AppViewForm
            action={createAppViewAction.bind(null, contractId)}
            entityTypes={data.entityTypes}
            submitLabel="Crear experiencia"
          />
        </CardContent>
      </Card>
    </div>
  );
}
