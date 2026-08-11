"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteContractConfirmationText } from "@/lib/contract-deletion";

export function DeleteContractForm({
  action,
  contract,
  closeHref,
  errorMessage,
  returnTo,
  successTo,
}: {
  action: (formData: FormData) => void | Promise<void>;
  contract: {
    name: string;
    code: string;
    organizationName: string;
  };
  closeHref: string;
  errorMessage?: string;
  returnTo: string;
  successTo: string;
}) {
  const router = useRouter();
  const [confirmationText, setConfirmationText] = useState("");
  const expectedConfirmation = deleteContractConfirmationText(contract.code);
  const canSubmit = confirmationText === expectedConfirmation;

  function close() {
    router.replace(closeHref, { scroll: false });
  }

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) close();
      }}
      open
    >
      <AlertDialogContent>
        <div className="grid gap-2">
          <AlertDialogTitle>Eliminar contrato permanentemente</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción eliminará el contrato y toda su información asociada. No se puede deshacer.
          </AlertDialogDescription>
        </div>

        <dl className="grid gap-1 rounded-md border border-border bg-muted p-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Nombre</dt>
            <dd className="text-right font-medium">{contract.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Código</dt>
            <dd className="text-right font-medium">{contract.code}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Organización</dt>
            <dd className="text-right font-medium">{contract.organizationName}</dd>
          </div>
        </dl>

        <form action={action} className="grid gap-4">
          <input name="returnTo" type="hidden" value={returnTo} />
          <input name="successTo" type="hidden" value={successTo} />
          <label className="grid gap-2 text-sm font-medium">
            Escribe exactamente:
            <span className="rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm">
              {expectedConfirmation}
            </span>
            <input
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
              name="confirmationText"
              onChange={(event) => setConfirmationText(event.target.value)}
              value={confirmationText}
            />
          </label>
          {errorMessage ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}
          <div className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
            La eliminación física de un contrato elimina también su historial contractual.
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={close} type="button" variant="outline">
              Cancelar
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!canSubmit}
              type="submit"
            >
              Eliminar permanentemente
            </Button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
