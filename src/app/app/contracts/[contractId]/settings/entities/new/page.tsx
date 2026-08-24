import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthorizedContractAdmin } from "@/lib/contracts";

import { createEntityTypeAction } from "../actions";
import { EntityTypeForm } from "../entity-type-form";
import { FormError } from "../form-error";

export default async function NewEntityTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ contractId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { contractId } = await params;
  const contract = await getAuthorizedContractAdmin(contractId, session.user.id);

  if (!contract) {
    notFound();
  }

  const { error } = await searchParams;

  return (
    <div className="grid max-w-2xl gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Nuevo tipo de entidad</h1>
          <p className="text-sm text-muted-foreground">{contract.name}</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/app/contracts/${contractId}/settings/entities`}>
            Volver
          </Link>
        </Button>
      </header>

      <FormError message={error} />

      <Card>
        <CardHeader>
          <CardTitle>Datos del tipo</CardTitle>
        </CardHeader>
        <CardContent>
          <EntityTypeForm
            action={createEntityTypeAction.bind(null, contractId)}
            submitLabel="Crear tipo"
          />
        </CardContent>
      </Card>
    </div>
  );
}
