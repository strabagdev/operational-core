import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { Button } from "@/components/ui/button";
import { getAuthorizedContract } from "@/lib/contracts";

import { ContractContextHeader } from "./contract-context-header";
import { ContractNavigationRail } from "./contract-navigation-rail";

export default async function ContractLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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

  const navigation = [
    { label: "Resumen" as const, href: `/app/contracts/${contract.id}` },
    {
      label: "Registros" as const,
      href: `/app/contracts/${contract.id}/records`,
    },
    {
      label: "Actividad" as const,
      href: `/app/contracts/${contract.id}/activity`,
    },
    {
      label: "Configuración" as const,
      href: `/app/contracts/${contract.id}/settings`,
    },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <ContractNavigationRail
        contractCode={contract.code}
        contractName={contract.name}
        navigation={navigation}
        userEmail={session.user.email}
        userImage={session.user.image}
        userName={session.user.name}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <ContractContextHeader
          contractCode={contract.code}
          contractName={contract.name}
          organizationName={contract.organization.name}
          userEmail={session.user.email}
          userImage={session.user.image}
          userName={session.user.name}
        />

        <div className="border-b border-border px-4 py-3 md:hidden">
          <nav className="flex gap-2 overflow-x-auto">
            {navigation.map((item) => (
              <Button asChild key={item.href} size="sm" variant="outline">
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
            <ThemeToggleButton
              className="shrink-0 border border-border"
              tooltipClassName="left-auto right-0 top-[calc(100%+0.5rem)] translate-y-0"
            />
          </nav>
        </div>

        <main className="flex-1 px-4 py-6 md:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
