"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ContractStatus } from "@prisma/client";

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
import { contractStatusLabels } from "@/lib/contract-status";

type ContractFormValues = {
  id?: string;
  name?: string;
  code?: string;
  status?: ContractStatus;
  organizationId?: string;
};

type OrganizationOption = {
  id: string;
  name: string;
};

export function ContractFormSheet({
  action,
  closeHref,
  contract,
  organizations,
  returnTo,
  successTo,
}: {
  action: (formData: FormData) => void | Promise<void>;
  closeHref: string;
  contract?: ContractFormValues;
  organizations: OrganizationOption[];
  returnTo: string;
  successTo: string;
}) {
  const router = useRouter();
  const mode = contract?.id ? "edit" : "create";
  const title = mode === "create" ? "Nuevo contrato" : "Editar contrato";
  const description =
    mode === "create"
      ? "Crea un contexto operacional dentro de una organización disponible."
      : "Actualiza los datos técnicos del contrato.";
  const defaultOrganizationId = useMemo(
    () => contract?.organizationId ?? organizations[0]?.id ?? "",
    [contract?.organizationId, organizations],
  );
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
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <form action={action} className="flex min-h-0 flex-1 flex-col" onChange={() => setDirty(true)}>
            <div className="grid flex-1 content-start gap-4 overflow-y-auto p-5">
              <input name="returnTo" type="hidden" value={returnTo} />
              <input name="successTo" type="hidden" value={successTo} />
              {organizations.length > 1 || mode === "create" ? (
                <label className="grid gap-2 text-sm font-medium">
                  Organización
                  <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue={defaultOrganizationId}
                    disabled={mode === "edit"}
                    name="organizationId"
                    required
                  >
                    {organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                      </option>
                    ))}
                  </select>
                  {mode === "edit" ? (
                    <input name="organizationId" type="hidden" value={defaultOrganizationId} />
                  ) : null}
                </label>
              ) : null}
              <label className="grid gap-2 text-sm font-medium">
                Nombre
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
                  defaultValue={contract?.name ?? ""}
                  name="name"
                  required
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Código
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
                  defaultValue={contract?.code ?? ""}
                  name="code"
                  required
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Estado
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={contract?.status ?? "ACTIVE"}
                  name="status"
                >
                  <option value="ACTIVE">{contractStatusLabels.ACTIVE}</option>
                  <option value="INACTIVE">{contractStatusLabels.INACTIVE}</option>
                  {mode === "edit" ? (
                    <option value="ARCHIVED">{contractStatusLabels.ARCHIVED}</option>
                  ) : null}
                </select>
              </label>
            </div>
            <SheetFooter>
              <div className="flex flex-wrap justify-end gap-2">
                <Button asChild type="button" variant="outline">
                  <Link href={closeHref}>Cancelar</Link>
                </Button>
                <Button type="submit">
                  {mode === "create" ? "Crear contrato" : "Guardar contrato"}
                </Button>
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
