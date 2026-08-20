"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function DeactivateOrganizationDialog({
  action,
  closeHref,
  organizationName,
  returnTo,
}: {
  action: (formData: FormData) => void | Promise<void>;
  closeHref: string;
  organizationName: string;
  returnTo: string;
}) {
  const router = useRouter();

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          router.replace(closeHref, { scroll: false });
        }
      }}
    >
      <AlertDialogContent>
        <div className="grid gap-2">
          <AlertDialogTitle>Desactivar organización</AlertDialogTitle>
          <AlertDialogDescription>
            {organizationName} quedará inactiva. Sus usuarios dejarán de poder operar
            contratos hasta que la organización sea reactivada.
          </AlertDialogDescription>
        </div>
        <form action={action} className="flex justify-end gap-2">
          <input name="returnTo" type="hidden" value={returnTo} />
          <Button asChild type="button" variant="outline">
            <Link href={closeHref}>Cancelar</Link>
          </Button>
          <Button
            className="border border-destructive bg-background text-destructive hover:bg-destructive hover:text-destructive-foreground"
            type="submit"
            variant="outline"
          >
            Desactivar
          </Button>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
