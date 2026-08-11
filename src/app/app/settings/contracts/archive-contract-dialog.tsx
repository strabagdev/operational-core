"use client";

import { useRouter } from "next/navigation";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function ArchiveContractDialog({
  action,
  closeHref,
  contractName,
  errorMessage,
  returnTo,
  successTo,
}: {
  action: (formData: FormData) => void | Promise<void>;
  closeHref: string;
  contractName: string;
  errorMessage?: string;
  returnTo: string;
  successTo: string;
}) {
  const router = useRouter();

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
        <AlertDialogTitle>Archivar {contractName}</AlertDialogTitle>
        <AlertDialogDescription>
          Este contrato dejará de estar disponible para operación, pero su información se conservará.
        </AlertDialogDescription>
        {errorMessage ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
        <div className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
          Archivar conserva la información y retira el contrato de la operación diaria.
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={close} type="button" variant="outline">
            Cancelar
          </Button>
          <form action={action}>
            <input name="returnTo" type="hidden" value={returnTo} />
            <input name="successTo" type="hidden" value={successTo} />
            <Button type="submit">Archivar</Button>
          </form>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
