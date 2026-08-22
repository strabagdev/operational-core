"use client";

import type React from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createRecordListAutoRefreshController } from "@/lib/record-list-auto-refresh";

const refreshIndicatorMinMs = 750;

export function RecordListAutoRefresh() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const controllerRef = useRef<ReturnType<typeof createRecordListAutoRefreshController> | null>(null);

  useEffect(() => {
    controllerRef.current = createRecordListAutoRefreshController({
      refresh: () =>
        new Promise<void>((resolve) => {
          startTransition(() => {
            router.refresh();
          });
          window.setTimeout(resolve, refreshIndicatorMinMs);
        }),
      setRefreshing,
    });

    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, [router]);

  const active = refreshing || isPending;

  return (
    <div className="flex items-center gap-2">
      {active ? (
        <span className="text-xs text-muted-foreground" role="status">
          Actualizando...
        </span>
      ) : null}
      <TooltipIconButton label="Actualizar">
        <Button
          aria-label="Actualizar"
          disabled={active}
          onClick={() => controllerRef.current?.refreshNow()}
          size="icon"
          type="button"
          variant="outline"
        >
          <RefreshCw aria-hidden="true" className={active ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </TooltipIconButton>
    </div>
  );
}

function TooltipIconButton({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        className="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-50 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-md transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        role="tooltip"
      >
        {label}
      </span>
    </span>
  );
}
