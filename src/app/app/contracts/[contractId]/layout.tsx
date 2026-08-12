import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { getAuthorizedContract } from "@/lib/contracts";

import { ContractNavigationRail } from "./contract-navigation-rail";
import { UserMenu } from "./user-menu";

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
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 items-center justify-between gap-4 border-b border-border px-4 md:px-6">
          <div className="min-w-0">
            <div className="truncate font-semibold">{contract.name}</div>
            <div className="truncate text-sm text-muted-foreground">
              {contract.code} · {contract.organization.name}
            </div>
          </div>

          <UserMenu
            email={session.user.email}
            image={session.user.image}
            name={session.user.name}
          />
        </header>

        <div className="border-b border-border px-4 py-3 md:hidden">
          <nav className="flex gap-2 overflow-x-auto">
            {navigation.map((item) => (
              <Button asChild key={item.href} size="sm" variant="outline">
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
          </nav>
        </div>

        <main className="flex-1 px-4 py-6 md:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
