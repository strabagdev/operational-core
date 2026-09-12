"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function PanelEditorTopBar({
  actionPending,
  active,
  dirty,
  name,
  submitLabel,
}: {
  actionPending: boolean;
  active: boolean;
  dirty: boolean;
  name: string;
  submitLabel: string;
}) {
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <Button asChild size="sm" type="button" variant="ghost">
          <a href="../views">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </a>
        </Button>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{name}</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className={cn(
              "rounded-full border px-2 py-0.5",
              active ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-700",
            )}>
              {active ? "Activo" : "Inactivo"}
            </span>
            {dirty ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-900">Cambios sin guardar</span> : null}
          </div>
        </div>
      </div>
      <Button disabled={actionPending} type="submit">
        {actionPending ? "Guardando..." : submitLabel}
      </Button>
    </div>
  );
}

export function PanelEditorSheet({
  children,
  description,
  dirty,
  onClose,
  onSave,
  open,
  title,
}: {
  children: ReactNode;
  description: string;
  dirty: boolean;
  onClose: () => void;
  onSave: () => void;
  open: boolean;
  title: string;
}) {
  const requestClose = () => {
    if (dirty && !window.confirm("Tienes cambios sin guardar en esta ventana. ¿Descartarlos?")) {
      return;
    }

    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) {
        requestClose();
      }
    }}>
      <SheetContent className="sm:max-w-[860px]" onCloseClick={requestClose}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-auto p-5">
          {children}
        </div>
        <SheetFooter>
          <div className="flex justify-end gap-2">
            <Button onClick={requestClose} type="button" variant="outline">Cancelar</Button>
            <Button onClick={onSave} type="button">Guardar</Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
