import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Boxes, ExternalLink, LayoutDashboard } from "lucide-react";

import { auth } from "@/auth";
import {
  PageHeader,
  StatusBadge,
  SummaryCard,
} from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { getAuthorizedContractAdmin } from "@/lib/contracts";

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
  const contract = await getAuthorizedContractAdmin(contractId, session.user.id);

  if (!contract) {
    notFound();
  }

  return (
    <div className="grid w-full gap-6">
      <PageHeader
        description="Administra la configuración base del contrato."
        metadata={(
          <>
            <StatusBadge variant="info">{contract.name}</StatusBadge>
            <StatusBadge variant="neutral">{contract.organization.name}</StatusBadge>
          </>
        )}
        title="Configuración"
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          actions={(
            <Button asChild variant="outline">
              <Link href={`/app/contracts/${contract.id}/settings/entities`}>
                Abrir
              </Link>
            </Button>
          )}
          description="Define tipos de entidad, campos y opciones de datos operacionales."
          icon={<Boxes aria-hidden="true" className="h-4 w-4" />}
          title="Tipos de entidad"
        />
        <SummaryCard
          actions={(
            <Button asChild variant="outline">
              <Link href={`/app/contracts/${contract.id}/settings/views`}>
                Abrir
              </Link>
            </Button>
          )}
          description="Configura experiencias, vistas, paneles y accesos asociados."
          icon={<LayoutDashboard aria-hidden="true" className="h-4 w-4" />}
          title="Experiencias"
        />
        <SummaryCard
          actions={(
            <Button asChild variant="outline">
              <Link href="/app/settings/apps">
                Abrir
              </Link>
            </Button>
          )}
          description="Administra aplicaciones externas autorizadas para integraciones."
          icon={<ExternalLink aria-hidden="true" className="h-4 w-4" />}
          title="Aplicaciones externas"
        />
      </section>
    </div>
  );
}
