import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  canManageContract,
  canManageExternalApps,
  canManageUsers,
} from "@/lib/capabilities";
import { getInactiveUserOrganizations, getUserContracts } from "@/lib/contracts";
import { getPlatformNavigationItems } from "@/lib/platform-navigation";

export default async function AppPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const [contracts, inactiveOrganizations] = await Promise.all([
    getUserContracts(session.user.id),
    getInactiveUserOrganizations(session.user.id),
  ]);
  const platformNavigation = getPlatformNavigationItems(session.user.platformRole);
  const adminContract = contracts.find((contract) =>
    canManageContract({ membershipRole: contract.membershipRole }),
  );
  const adminContext = { membershipRole: adminContract?.membershipRole };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="space-y-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Operational Core</h1>
            <p className="text-sm text-muted-foreground">
              Selecciona un contrato para continuar.
            </p>
          </div>
          {adminContract ? (
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {canManageUsers(adminContext) ? (
                <Button asChild variant="outline">
                  <Link href="/app/settings/users">Usuarios</Link>
                </Button>
              ) : null}
              <Button asChild variant="outline">
                <Link href="/app/settings/contracts">Administrar contratos</Link>
              </Button>
              {canManageExternalApps(adminContext) ? (
                <Button asChild variant="outline">
                  <Link href="/app/settings/apps">Aplicaciones externas</Link>
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <section className="grid gap-3">
        {platformNavigation.length > 0 ? (
          <div className="grid gap-3 rounded-md border border-border p-4">
            <div>
              <h2 className="text-base font-semibold">Plataforma</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {platformNavigation.map((item) => (
                <Button asChild key={item.href} variant="outline">
                  <Link href={item.href}>{item.label}</Link>
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {inactiveOrganizations.length > 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm font-medium">Esta organización se encuentra inactiva.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {inactiveOrganizations.map((organization) => organization.name).join(", ")}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {contracts.length > 0 ? (
          contracts.map((contract) => (
              <Card key={contract.id}>
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <CardTitle>{contract.name}</CardTitle>
                      <CardDescription>{contract.organization.name}</CardDescription>
                    </div>
                    <span className="rounded-md border border-border px-2 py-1 text-xs font-medium">
                      Activo
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4">
                  <div className="text-sm text-muted-foreground">
                    Código:{" "}
                    <span className="font-medium text-foreground">
                      {contract.code}
                    </span>
                  </div>
                  <Button asChild>
                    <Link href={`/app/contracts/${contract.id}`}>
                      Abrir contrato
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))
        ) : (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                No hay contratos disponibles para tu usuario.
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      <Separator />
    </main>
  );
}
