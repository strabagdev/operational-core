"use client";

import { Button } from "@/components/ui/button";

export default function AppError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Servicio temporalmente no disponible</h1>
          <p className="text-sm text-muted-foreground">
            No pudimos completar la lectura. Intenta nuevamente en unos segundos.
          </p>
        </div>
        <Button onClick={() => retry()} type="button">
          Reintentar
        </Button>
      </div>
    </main>
  );
}
