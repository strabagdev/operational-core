"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type ExternalAppFormValues = {
  active?: boolean;
  clientId?: string;
  id?: string;
  name?: string;
  slug?: string;
};

export function ExternalAppFormSheet({
  action,
  app,
  closeHref,
  returnTo,
  successTo,
}: {
  action: (formData: FormData) => void | Promise<void>;
  app?: ExternalAppFormValues;
  closeHref: string;
  returnTo: string;
  successTo: string;
}) {
  const router = useRouter();
  const mode = app?.id ? "edit" : "create";

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) {
          router.replace(closeHref, { scroll: false });
        }
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {mode === "create" ? "Nueva aplicación" : "Editar aplicación"}
          </SheetTitle>
          <SheetDescription>
            Administra la identificación interna de una aplicación externa.
          </SheetDescription>
        </SheetHeader>
        <form action={action} className="flex min-h-0 flex-1 flex-col">
          <div className="grid flex-1 content-start gap-4 overflow-y-auto p-5">
            <input name="returnTo" type="hidden" value={returnTo} />
            <input name="successTo" type="hidden" value={successTo} />
            <label className="grid gap-2 text-sm font-medium">
              Nombre
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
                defaultValue={app?.name ?? ""}
                name="name"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Slug
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
                defaultValue={app?.slug ?? ""}
                name="slug"
                required
              />
            </label>
            {app?.clientId ? (
              <label className="grid gap-2 text-sm font-medium">
                Client ID
                <input
                  className="h-10 rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground"
                  readOnly
                  value={app.clientId}
                />
              </label>
            ) : null}
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                className="h-4 w-4 rounded border-input"
                defaultChecked={app?.active ?? true}
                name="active"
                type="checkbox"
              />
              Activa
            </label>
          </div>
          <SheetFooter>
            <div className="flex flex-wrap justify-end gap-2">
              <Button asChild type="button" variant="outline">
                <Link href={closeHref}>Cancelar</Link>
              </Button>
              <Button type="submit">
                {mode === "create" ? "Crear aplicación" : "Guardar aplicación"}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
