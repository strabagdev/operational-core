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

export function FieldDeleteForm({
  action,
  blockedMessage,
  canDelete,
  fieldName,
  returnTo,
}: {
  action: (formData: FormData) => void | Promise<void>;
  blockedMessage?: string;
  canDelete: boolean;
  fieldName: string;
  returnTo: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (confirmed) {
      return;
    }

    event.preventDefault();

    if (canDelete) {
      setConfirmOpen(true);
    }
  }

  if (!canDelete) {
    return (
      <div className="grid gap-1 text-left">
        <span className="text-sm text-muted-foreground">Eliminar definitivamente</span>
        <span className="max-w-64 text-xs leading-5 text-muted-foreground">
          {blockedMessage}
        </span>
      </div>
    );
  }

  return (
    <>
      <form action={action} onSubmit={handleSubmit} ref={formRef}>
        <input name="returnTo" type="hidden" value={returnTo} />
        <DeleteButton />
      </form>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <div className="grid gap-2">
            <AlertDialogTitle>Eliminar campo «{fieldName}»</AlertDialogTitle>
            <AlertDialogDescription>
              Este campo nunca ha sido utilizado. Al eliminarlo se quitará permanentemente de la configuración de la entidad.
            </AlertDialogDescription>
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirmOpen(false)} type="button" variant="outline">
              Cancelar
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmed(true);
                setConfirmOpen(false);
                window.requestAnimationFrame(() => {
                  formRef.current?.requestSubmit();
                });
              }}
              type="button"
            >
              Eliminar definitivamente
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DeleteButton() {
  const status = useFormStatus();

  return (
    <button
      className="w-full text-left text-destructive disabled:opacity-50"
      disabled={status.pending}
      type="submit"
    >
      {status.pending ? "Eliminando..." : "Eliminar definitivamente"}
    </button>
  );
}
