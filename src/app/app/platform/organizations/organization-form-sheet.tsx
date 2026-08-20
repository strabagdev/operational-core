"use client";

import { useMemo, useState } from "react";
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
import { normalizeOrganizationSlug } from "@/lib/organization-slug";

type OrganizationFormValues = {
  id?: string;
  name?: string;
  slug?: string;
};

export function OrganizationFormSheet({
  action,
  closeHref,
  organization,
  returnTo,
  successTo,
}: {
  action: (formData: FormData) => void | Promise<void>;
  closeHref: string;
  organization?: OrganizationFormValues;
  returnTo: string;
  successTo: string;
}) {
  const router = useRouter();
  const mode = organization?.id ? "edit" : "create";
  const [name, setName] = useState(organization?.name ?? "");
  const [slug, setSlug] = useState(organization?.slug ?? "");
  const [slugDirty, setSlugDirty] = useState(mode === "edit");
  const [dirty, setDirty] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const title = mode === "create" ? "Nueva organización" : "Editar organización";
  const description = mode === "create"
    ? "Crea una organización activa con su administrador inicial."
    : "Actualiza nombre y slug sin alterar identidad ni relaciones internas.";
  const submitLabel = mode === "create" ? "Crear organización" : "Guardar organización";
  const currentSlug = useMemo(() => slug || normalizeOrganizationSlug(name), [name, slug]);

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
          <form action={action} className="flex min-h-0 flex-1 flex-col">
            <div className="grid flex-1 content-start gap-4 overflow-y-auto p-5">
              <input name="returnTo" type="hidden" value={returnTo} />
              <input name="successTo" type="hidden" value={successTo} />
              <label className="grid gap-2 text-sm font-medium">
                Nombre
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
                  name="name"
                  onChange={(event) => {
                    const nextName = event.target.value;

                    setDirty(true);
                    setName(nextName);

                    if (!slugDirty) {
                      setSlug(normalizeOrganizationSlug(nextName));
                    }
                  }}
                  required
                  value={name}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Slug
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
                  name="slug"
                  onChange={(event) => {
                    setDirty(true);
                    setSlugDirty(true);
                    setSlug(normalizeOrganizationSlug(event.target.value));
                  }}
                  required
                  value={currentSlug}
                />
              </label>
              {mode === "create" ? (
                <>
                  <div className="border-t border-border pt-4">
                    <h3 className="text-sm font-semibold">Administrador inicial</h3>
                  </div>
                  <label className="grid gap-2 text-sm font-medium">
                    Nombre
                    <input
                      autoComplete="name"
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
                      name="adminName"
                      onChange={() => setDirty(true)}
                      required
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    Email
                    <input
                      autoComplete="email"
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
                      name="adminEmail"
                      onChange={() => setDirty(true)}
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
                      name="adminPassword"
                      onChange={() => setDirty(true)}
                      required
                      type="password"
                    />
                  </label>
                </>
              ) : null}
            </div>
            <SheetFooter>
              <div className="flex flex-wrap justify-end gap-2">
                <Button asChild type="button" variant="outline">
                  <Link href={closeHref}>Cancelar</Link>
                </Button>
                <Button type="submit">{submitLabel}</Button>
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
