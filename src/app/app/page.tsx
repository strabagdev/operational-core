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
import { getUserContracts } from "@/lib/contracts";

export default async function AppPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const contracts = await getUserContracts(session.user.id);

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
          <Button asChild variant="outline">
            <Link href="/app/settings/contracts">Administrar contratos</Link>
          </Button>
        </div>
      </header>

      <section className="grid gap-3">
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
