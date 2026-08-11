import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Activity, Settings, TableProperties, UserRound } from "lucide-react";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { getAuthorizedContract } from "@/lib/contracts";

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
    { label: "Resumen", href: `/app/contracts/${contract.id}`, icon: UserRound },
    {
      label: "Registros",
      href: `/app/contracts/${contract.id}/records`,
      icon: TableProperties,
    },
    {
      label: "Actividad",
      href: `/app/contracts/${contract.id}/activity`,
      icon: Activity,
    },
    {
      label: "Configuración",
      href: `/app/contracts/${contract.id}/settings`,
      icon: Settings,
    },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 border-r border-border px-4 py-6 md:block">
        <Link className="block px-2 text-lg font-semibold" href="/app">
          Operational Core
        </Link>
        <nav className="mt-8 grid gap-1">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <Button
                asChild
                className="justify-start"
                key={item.href}
                variant="ghost"
              >
                <Link href={item.href}>
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </Button>
            );
          })}
        </nav>
      </aside>

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

        <main className="flex-1 px-4 py-6 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
