"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type OrganizationOption = {
  id: string;
  name: string;
};

export function UserFormSheet({
  action,
  closeHref,
  organizations,
  returnTo,
  successTo,
}: {
  action: (formData: FormData) => void | Promise<void>;
  closeHref: string;
  organizations: OrganizationOption[];
  returnTo: string;
  successTo: string;
}) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);

  function requestClose() {
    if (dirty) {
      setShowDiscard(true);
      return;
    }

    router.replace(closeHref, { scroll: false });
  }

  function discardChanges() {
    setShowDiscard(false);
    setDirty(false);
    router.replace(closeHref, { scroll: false });
  }

  return (
    <>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <SheetContent
          className="sm:max-w-[680px]"
          onCloseClick={requestClose}
          onEscapeKeyDown={(event) => {
            if (dirty) {
              event.preventDefault();
              requestClose();
            }
          }}
          onInteractOutside={(event) => {
            if (dirty) {
              event.preventDefault();
              requestClose();
            }
          }}
        >
          <SheetHeader>
            <SheetTitle>Agregar usuario</SheetTitle>
            <SheetDescription>
              Crea un usuario local o agrega uno existente a la organización.
            </SheetDescription>
          </SheetHeader>
          <form action={action} className="flex min-h-0 flex-1 flex-col" onChange={() => setDirty(true)}>
            <div className="grid flex-1 content-start gap-4 overflow-y-auto p-5">
              <input name="returnTo" type="hidden" value={returnTo} />
              <input name="successTo" type="hidden" value={successTo} />
              <input name="organizationId" type="hidden" value={organizations[0]?.id ?? ""} />
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
              <label className="grid gap-2 text-sm font-medium">
                Contraseña inicial
                <input
                  autoComplete="new-password"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
                  minLength={8}
                  name="password"
                  type="password"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Rol
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue="MEMBER"
                  name="role"
                >
                  <option value="MEMBER">MEMBER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </label>
            </div>
            <SheetFooter>
              <div className="flex flex-wrap justify-end gap-2">
                <Button asChild type="button" variant="outline">
                  <Link href={closeHref}>Cancelar</Link>
                </Button>
                <Button type="submit">Agregar usuario</Button>
              </div>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={showDiscard} onOpenChange={setShowDiscard}>
        <AlertDialogContent>
          <div className="grid gap-2">
            <AlertDialogTitle>Tienes cambios sin guardar</AlertDialogTitle>
            <AlertDialogDescription>
              Si cierras ahora, se perderán los cambios realizados.
            </AlertDialogDescription>
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setShowDiscard(false)} type="button" variant="outline">
              Seguir editando
            </Button>
            <Button onClick={discardChanges} type="button">
              Descartar cambios
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
