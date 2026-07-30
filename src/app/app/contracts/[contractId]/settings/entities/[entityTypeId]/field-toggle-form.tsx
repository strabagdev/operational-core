"use client";

import type React from "react";
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function FieldToggleForm({
  action,
  isActive,
  isPrimary,
  returnTo,
}: {
  action: (formData: FormData) => void | Promise<void>;
  isActive: boolean;
  isPrimary: boolean;
  returnTo: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [primaryBlocked, setPrimaryBlocked] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (!isActive) {
      return;
    }

    if (isPrimary) {
      event.preventDefault();
      setPrimaryBlocked(true);
      return;
    }

    if (!confirmed) {
      event.preventDefault();
      setConfirmOpen(true);
    }
  }

  return (
    <>
      <form action={action} onSubmit={handleSubmit} ref={formRef}>
        <input name="returnTo" type="hidden" value={returnTo} />
        <ToggleButton isActive={isActive} />
      </form>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <div className="grid gap-2">
            <AlertDialogTitle>Desactivar campo</AlertDialogTitle>
            <AlertDialogDescription>
              El campo dejará de estar disponible en formularios nuevos. La información existente se conservará.
            </AlertDialogDescription>
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirmOpen(false)} type="button" variant="outline">
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setConfirmed(true);
                setConfirmOpen(false);
                window.requestAnimationFrame(() => {
                  formRef.current?.requestSubmit();
                });
              }}
              type="button"
            >
              Desactivar
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={primaryBlocked} onOpenChange={setPrimaryBlocked}>
        <AlertDialogContent>
          <div className="grid gap-2">
            <AlertDialogTitle>No puedes desactivar el campo principal</AlertDialogTitle>
            <AlertDialogDescription>
              Selecciona otro campo principal primero.
            </AlertDialogDescription>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setPrimaryBlocked(false)} type="button">
              Entendido
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ToggleButton({ isActive }: { isActive: boolean }) {
  const status = useFormStatus();

  return (
    <button
      className="w-full text-left disabled:opacity-50"
      disabled={status.pending}
      type="submit"
    >
      {status.pending
        ? isActive
          ? "Desactivando..."
          : "Activando..."
        : isActive
          ? "Desactivar"
          : "Activar"}
    </button>
  );
}
