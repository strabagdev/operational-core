"use client";

import { startTransition, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import {
  importEntityRecordsAction,
  type ImportEntityRecordsActionState,
} from "../actions";

const initialState: ImportEntityRecordsActionState = { status: "idle" };

export function ImportRecordsSheet({
  contractId,
  entityName,
  entityTypeId,
}: {
  contractId: string;
  entityName: string;
  entityTypeId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState(false);
  const hasErrors = state.status === "error" && Boolean(state.errors?.length);
  const isValid = state.status === "valid";

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => setNotice(null), 6000);

    return () => window.clearTimeout(timeout);
  }, [notice]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;

    if (submitter instanceof HTMLButtonElement && submitter.name) {
      formData.set(submitter.name, submitter.value);
    }

    setPending(true);
    startTransition(async () => {
      const nextState = await importEntityRecordsAction(contractId, entityTypeId, state, formData);

      setState(nextState);
      setPending(false);

      if (nextState.status === "success") {
        setOpen(false);
        setNotice(compactImportNotice(nextState));
        form.reset();
        router.refresh();
      }
    });
  }

  return (
    <>
      {notice ? (
        <div
          className="fixed right-4 top-4 z-50 flex max-w-sm items-center gap-2 rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
          role="status"
        >
          <span>{notice}</span>
          <button
            aria-label="Cerrar mensaje de importación"
            className="rounded-sm px-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setNotice(null)}
            type="button"
          >
            x
          </button>
        </div>
      ) : null}
      <span className="group relative inline-flex">
        <Button
          aria-label="Importar Excel"
          onClick={() => {
            setState(initialState);
            setNotice(null);
            setOpen(true);
          }}
          size="icon"
          type="button"
          variant="outline"
        >
          <Upload aria-hidden="true" className="h-4 w-4" />
        </Button>
        <span
          className="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-50 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-md transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
          role="tooltip"
        >
          Importar Excel
        </span>
      </span>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Importar Excel</SheetTitle>
            <SheetDescription>
              Selecciona una plantilla Excel descargada desde esta entidad.
            </SheetDescription>
            <p className="text-xs font-medium text-muted-foreground">{entityName}</p>
          </SheetHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid gap-4">
                <label className="grid gap-2 text-sm font-medium">
                  Archivo .xlsx
                  <input
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm file:font-medium"
                    name="file"
                    required
                    type="file"
                  />
                </label>

                {pending ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    {isValid ? "Importando registros..." : "Validando archivo..."}
                  </p>
                ) : null}

                {state.message ? (
                  <p
                    className={
                      state.status === "success"
                        ? "text-sm text-muted-foreground"
                        : state.status === "error"
                          ? "text-sm text-destructive"
                          : "text-sm text-muted-foreground"
                    }
                    role="status"
                  >
                    {state.message}
                  </p>
                ) : null}

                {state.rowsRead !== undefined ? (
                  <div className="grid gap-2 rounded-md border border-border p-3 text-sm sm:grid-cols-5">
                    <SummaryItem label="Filas leídas" value={state.rowsRead} />
                    <SummaryItem label="Nuevos" value={state.createdCount ?? state.validRows ?? 0} />
                    <SummaryItem label="Actualizaciones" value={state.updatedCount ?? 0} />
                    <SummaryItem label="Cambios" value={state.changeCount ?? 0} />
                    <SummaryItem label="Con errores" value={state.errorRows ?? 0} />
                  </div>
                ) : null}

                {hasErrors ? (
                  <div className="max-h-80 overflow-auto rounded-md border border-border">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <thead className="border-b border-border text-muted-foreground">
                        <tr>
                          <th className="p-3 font-medium">Fila</th>
                          <th className="p-3 font-medium">Campo</th>
                          <th className="p-3 font-medium">Mensaje</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.errors?.map((error, index) => (
                          <tr className="border-b border-border last:border-0" key={index}>
                            <td className="p-3">{error.row || "-"}</td>
                            <td className="p-3">{error.field}</td>
                            <td className="p-3">{error.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </div>
            <SheetFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button onClick={() => setOpen(false)} type="button" variant="outline">
                Cerrar
              </Button>
              <ImportButtons
                createdCount={state.createdCount ?? state.validRows ?? 0}
                isPending={pending}
                isValid={isValid}
                updatedCount={state.updatedCount ?? 0}
              />
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function compactImportNotice(state: ImportEntityRecordsActionState) {
  const created = state.createdCount ?? state.importedCount ?? state.validRows ?? 0;
  const updated = state.updatedCount ?? 0;

  if (created > 0 && updated > 0) {
    return `${created} creados · ${updated} actualizados`;
  }

  if (updated > 0) {
    return `${updated} actualizados`;
  }

  if (created > 0) {
    return `${created} creados`;
  }

  return state.message ?? "Importación completada";
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ImportButtons({
  createdCount,
  isPending,
  isValid,
  updatedCount,
}: {
  createdCount: number;
  isPending: boolean;
  isValid: boolean;
  updatedCount: number;
}) {
  return isValid ? (
    <Button disabled={isPending} name="intent" type="submit" value="import">
      {isPending ? "Importando registros..." : importButtonLabel(createdCount, updatedCount)}
    </Button>
  ) : (
    <Button disabled={isPending} name="intent" type="submit" value="validate">
      {isPending ? "Validando archivo..." : "Validar archivo"}
    </Button>
  );
}

function importButtonLabel(createdCount: number, updatedCount: number) {
  if (createdCount > 0 && updatedCount > 0) {
    return `Importar ${createdCount} nuevos y actualizar ${updatedCount}`;
  }

  if (updatedCount > 0) {
    return `Actualizar ${updatedCount} registros`;
  }

  return `Importar ${createdCount} registros`;
}
