import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getAuthorizedContract } from "@/lib/contracts";

const statusLabels = {
  ACTIVE: "Activo",
  ARCHIVED: "Archivado",
};

export default async function ContractSummaryPage({
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
    <div className="grid max-w-3xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{contract.name}</CardTitle>
          <CardDescription>{contract.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <div className="grid gap-1">
            <span className="text-muted-foreground">Código</span>
            <span className="font-medium">{contract.code}</span>
          </div>
          <Separator />
          <div className="grid gap-1">
            <span className="text-muted-foreground">Organización</span>
            <span className="font-medium">{contract.organization.name}</span>
          </div>
          <Separator />
          <div className="grid gap-1">
            <span className="text-muted-foreground">Estado</span>
            <span className="font-medium">{statusLabels[contract.status]}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fuente única de verdad</CardTitle>
          <CardDescription>
            Aquí se centralizarán las personas, equipos, documentos y demás
            registros operacionales del contrato.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
