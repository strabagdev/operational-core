import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Activity, FileText, Settings, TableProperties } from "lucide-react";

import { auth } from "@/auth";
import {
  PageHeader,
  StatusBadge,
  SummaryCard,
} from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import {
  type ContractNavigationItem,
  getContractNavigationItems,
} from "@/lib/contract-layout-navigation";
import { getAuthorizedContract } from "@/lib/contracts";
import { contractStatusLabels } from "@/lib/contract-status";

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

  const navigation = getContractNavigationItems({
    contractId: contract.id,
    membershipRole: contract.membershipRole,
  }).filter((item) => item.label !== "Resumen");

  return (
    <div className="grid w-full gap-6">
      <PageHeader
        description={contract.description}
        metadata={(
          <>
            <StatusBadge variant="active">{contractStatusLabels[contract.status]}</StatusBadge>
            <StatusBadge variant="info">{contract.organization.name}</StatusBadge>
          </>
        )}
        title={contract.name}
      />

      <section className="grid gap-3 md:grid-cols-3">
        <SummaryCard
          badges={<StatusBadge variant="neutral">Identificación</StatusBadge>}
          metadata={[
            { label: "Código", value: contract.code },
            { label: "Organización", value: contract.organization.name },
            { label: "Estado", value: contractStatusLabels[contract.status] },
          ]}
          title="Contexto contractual"
        />
      </section>

      <section className="grid gap-3">
        <h2 className="text-base font-semibold">Accesos principales</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {navigation.map((item) => (
            <SummaryCard
              actions={(
                <Button asChild variant="outline">
                  <Link href={item.href}>Abrir</Link>
                </Button>
              )}
              description={navigationDescription(item)}
              icon={navigationIcon(item)}
              key={item.href}
              title={item.label}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function navigationDescription(item: ContractNavigationItem) {
  if (item.label === "Registros") {
    return "Consulta y gestiona la fuente operacional del contrato.";
  }
  if (item.label === "Actividad") {
    return "Revisa eventos y cambios relevantes del contrato.";
  }
  if (item.label === "Configuración") {
    return "Administra entidades, experiencias y opciones del contrato.";
  }

  return "Resumen del contrato.";
}

function navigationIcon(item: ContractNavigationItem) {
  const className = "h-4 w-4";
  if (item.label === "Registros") {
    return <TableProperties aria-hidden="true" className={className} />;
  }
  if (item.label === "Actividad") {
    return <Activity aria-hidden="true" className={className} />;
  }
  if (item.label === "Configuración") {
    return <Settings aria-hidden="true" className={className} />;
  }

  return <FileText aria-hidden="true" className={className} />;
}
