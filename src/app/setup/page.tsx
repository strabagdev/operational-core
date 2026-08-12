import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  createInitialSetup,
  getInitialSetupInput,
  initialSetupFriendlyError,
  initialSetupSuccessMessage,
  isInitialSetupRequired,
} from "@/lib/setup";

async function setupAction(formData: FormData) {
  "use server";

  try {
    await createInitialSetup(getInitialSetupInput(formData));
  } catch (error) {
    redirect(`/setup?error=${encodeURIComponent(initialSetupFriendlyError(error))}`);
  }

  redirect(`/login?notice=${encodeURIComponent(initialSetupSuccessMessage)}`);
}

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [session, setupRequired, params] = await Promise.all([
    auth(),
    isInitialSetupRequired(),
    searchParams,
  ]);

  if (!setupRequired) {
    redirect(session?.user?.id ? "/app" : "/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <form action={setupAction} className="grid w-full max-w-xl gap-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Configurar Operational Core</h1>
          <p className="text-sm text-muted-foreground">
            Crea la primera cuenta administradora y la organización inicial.
          </p>
        </header>

        {params.error ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">{params.error}</p>
            </CardContent>
          </Card>
        ) : null}

        <section className="grid gap-4">
          <h2 className="text-base font-semibold">Tu cuenta</h2>
          <label className="grid gap-2 text-sm font-medium">
            Nombre
            <input
              autoComplete="name"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
              name="name"
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Email
            <input
              autoComplete="email"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
              name="email"
              required
              type="email"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Contraseña
              <input
                autoComplete="new-password"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
                minLength={8}
                name="password"
                required
                type="password"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Confirmar contraseña
              <input
                autoComplete="new-password"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
                minLength={8}
                name="passwordConfirmation"
                required
                type="password"
              />
            </label>
          </div>
        </section>

        <section className="grid gap-4">
          <h2 className="text-base font-semibold">Organización</h2>
          <label className="grid gap-2 text-sm font-medium">
            Nombre de empresa u organización
            <input
              autoComplete="organization"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
              name="organizationName"
              required
            />
          </label>
        </section>

        <Button type="submit">Crear configuración inicial</Button>
      </form>
    </main>
  );
}
