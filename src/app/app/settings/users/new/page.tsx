import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getUserAdministration } from "@/lib/user-admin";

import { createUserAction } from "../actions";
import { UserForm } from "../user-form";

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { error, notice } = await searchParams;
  const data = await getUserAdministration({ userId: session.user.id });

  if (!data.organization) {
    notFound();
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-4xl gap-6 px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Nuevo usuario</h1>
          <p className="text-sm text-muted-foreground">
            Crea un acceso local en tu organización.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/app/settings/users">Volver</Link>
        </Button>
      </header>

      <ActionMessage error={error} notice={notice} />

      <UserForm
        action={createUserAction}
        passwordLabel="Contraseña inicial"
        passwordRequired
        returnTo="/app/settings/users/new"
        submitLabel="Crear usuario"
        successTo="/app/settings/users"
        title="Datos del usuario"
      />
    </main>
  );
}

function ActionMessage({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) {
    return null;
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <p className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {error ?? notice}
        </p>
      </CardContent>
    </Card>
  );
}
