import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthorizedContract } from "@/lib/contracts";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ contractId: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { contractId } = await params;
  const contract = await getAuthorizedContract(contractId, session.user.id);

  if (!contract) {
    notFound();
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Configuración</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          Administra la configuración base del contrato.
        </p>
        <div>
          <Button asChild variant="outline">
            <Link href={`/app/contracts/${contract.id}/settings/entities`}>
              Tipos de entidad
            </Link>
          </Button>
        </div>
        <div>
          <Button asChild variant="outline">
            <Link href={`/app/contracts/${contract.id}/settings/views`}>
              Experiencias
            </Link>
          </Button>
        </div>
        <div>
          <Button asChild variant="outline">
            <Link href="/app/settings/contracts">
              Contratos
            </Link>
          </Button>
        </div>
        <div>
          <Button asChild variant="outline">
            <Link href="/app/settings/apps">
              Aplicaciones externas
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
