import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { isDatabaseUnavailableError } from "@/lib/prisma-resilience";
import { isInitialSetupRequired } from "@/lib/setup";

async function loginAction(formData: FormData) {
  "use server";

  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/app",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if (isDatabaseUnavailableError(error)) {
        throw error;
      }

      redirect("/login?error=invalid-credentials");
    }

    throw error;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const [session, setupRequired] = await Promise.all([
    auth(),
    isInitialSetupRequired(),
  ]);

  if (session) {
    redirect("/app");
  }

  if (setupRequired) {
    redirect("/setup");
  }

  const { error, notice } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form action={loginAction} className="flex w-full max-w-sm flex-col gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Operational Core</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue.</p>
        </div>

        {error ? (
          <p className="text-sm text-destructive">
            Invalid email or password.
          </p>
        ) : null}
        {notice ? (
          <p className="text-sm text-muted-foreground">{notice}</p>
        ) : null}

        <label className="flex flex-col gap-2 text-sm font-medium">
          Email
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium">
          Password
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>

        <button
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          type="submit"
        >
          Login
        </button>
      </form>
    </main>
  );
}
