"use client";

import { startTransition, useState, type FormEvent } from "react";
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
        setNotice(nextState.message ?? null);
        form.reset();
        router.refresh();
      }
    });
  }

  return (
    <>
      {notice ? (
        <p className="w-full text-sm text-muted-foreground" role="status">
          {notice}
        </p>
      ) : null}
      <Button
        onClick={() => {
          setState(initialState);
          setNotice(null);
          setOpen(true);
        }}
        type="button"
        variant="outline"
      >
        Importar Excel
      </Button>
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
                  <div className="grid gap-2 rounded-md border border-border p-3 text-sm sm:grid-cols-3">
                    <SummaryItem label="Filas leídas" value={state.rowsRead} />
                    <SummaryItem label="Válidas" value={state.validRows ?? 0} />
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
                isPending={pending}
                validRows={state.validRows ?? 0}
                isValid={isValid}
              />
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
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
  isPending,
  isValid,
  validRows,
}: {
  isPending: boolean;
  isValid: boolean;
  validRows: number;
}) {
  return isValid ? (
    <Button disabled={isPending} name="intent" type="submit" value="import">
      {isPending ? "Importando registros..." : `Importar ${validRows} registros`}
    </Button>
  ) : (
    <Button disabled={isPending} name="intent" type="submit" value="validate">
      {isPending ? "Validando archivo..." : "Validar archivo"}
    </Button>
  );
}
