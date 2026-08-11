"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  getBulkSelectionState,
  toggleAllVisibleSelection,
  toggleRecordSelection,
} from "@/lib/entity-record-bulk-selection";
import {
  entityRecordDetailPath,
  entityRecordEditPath,
} from "@/lib/entity-record-routes";

import {
  type BulkEntityRecordsActionState,
} from "../actions";

type BulkAction = (
  formData: FormData,
) => Promise<BulkEntityRecordsActionState>;

type RecordRow = {
  id: string;
  displayName: string;
  updatedAt: string;
  values: Array<{ fieldId: string; value: string }>;
};

type ListField = {
  id: string;
  name: string;
};

export function EntityRecordsTable({
  contractId,
  deleteAction,
  displayHeader,
  entityTypeId,
  listFields,
  records,
}: {
  contractId: string;
  deleteAction: BulkAction;
  displayHeader: string;
  entityTypeId: string;
  listFields: ListField[];
  records: RecordRow[];
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [feedback, setFeedback] = useState<BulkEntityRecordsActionState | null>(null);
  const [pending, startTransition] = useTransition();
  const visibleIds = useMemo(() => records.map((record) => record.id), [records]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selection = getBulkSelectionState(selectedIds, visibleIds);
  const selectedCount = selection.selectedCount;
  const allVisibleSelected = selection.allSelected;
  const partiallySelected = selection.indeterminate;
  const deleteConfirmation = `ELIMINAR ${selectedCount} REGISTROS`;

  function toggleRecord(recordId: string) {
    setSelectedIds((current) => toggleRecordSelection(current, recordId));
  }

  function toggleAllVisible() {
    setSelectedIds((current) => toggleAllVisibleSelection(current, visibleIds));
  }

  function submitBulk(action: BulkAction, extra?: Record<string, string>) {
    submitRecordIds(action, selectedIds, extra);
  }

  function submitRecordIds(
    action: BulkAction,
    recordIds: string[],
    extra?: Record<string, string>,
  ) {
    const formData = new FormData();

    for (const recordId of recordIds) {
      formData.append("recordId", recordId);
    }

    for (const [key, value] of Object.entries(extra ?? {})) {
      formData.set(key, value);
    }

    startTransition(async () => {
      const result = await action(formData);

      setFeedback(result);

      if (result.success) {
        setSelectedIds([]);
        setDeleteOpen(false);
        setConfirmation("");
        router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-3">
      {feedback ? (
        <p
          className={feedback.success ? "text-sm text-muted-foreground" : "text-sm text-destructive"}
          role="status"
        >
          {feedback.message}
        </p>
      ) : null}

      {selectedCount > 0 ? (
        <div className="sticky top-2 z-10 flex flex-col gap-2 rounded-md border border-border bg-background p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium">{selectedCount} seleccionados</p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() => setDeleteOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              Eliminar permanentemente
            </Button>
            <Button
              disabled={pending}
              onClick={() => setSelectedIds([])}
              size="sm"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" className="h-4 w-4" />
              Limpiar selección
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="w-10 py-3 pr-3 font-medium">
                <IndeterminateCheckbox
                  ariaLabel="Seleccionar todos los registros visibles"
                  checked={allVisibleSelected}
                  disabled={visibleIds.length === 0}
                  indeterminate={partiallySelected}
                  onChange={toggleAllVisible}
                />
              </th>
              <th className="py-3 pr-4 font-medium">{displayHeader}</th>
              {listFields.map((field) => (
                <th className="py-3 pr-4 font-medium" key={field.id}>
                  {field.name}
                </th>
              ))}
              <th className="py-3 pr-4 font-medium">Actualizado</th>
              <th className="py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {records.length > 0 ? (
              records.map((record) => (
                <tr className="border-b border-border" key={record.id}>
                  <td className="py-3 pr-3">
                    <input
                      aria-label={`Seleccionar ${record.displayName}`}
                      checked={selectedSet.has(record.id)}
                      className="h-4 w-4"
                      onChange={() => toggleRecord(record.id)}
                      type="checkbox"
                    />
                  </td>
                  <td className="py-3 pr-4 font-medium">
                    <Link
                      className="text-primary underline-offset-4 hover:underline"
                      href={entityRecordDetailPath(contractId, entityTypeId, record.id)}
                    >
                      {record.displayName}
                    </Link>
                  </td>
                  {listFields.map((field) => (
                    <td className="py-3 pr-4" key={field.id}>
                      {record.values.find((value) => value.fieldId === field.id)?.value ?? ""}
                    </td>
                  ))}
                  <td className="py-3 pr-4">{record.updatedAt}</td>
                  <td className="py-3">
                    <div className="flex justify-end gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={entityRecordEditPath(contractId, entityTypeId, record.id)}>
                          Editar
                        </Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  className="py-6 text-sm text-muted-foreground"
                  colSpan={4 + listFields.length}
                >
                  No hay registros para estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setConfirmation("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Eliminar registros permanentemente</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción eliminará {selectedCount} registros y su información asociada. No se puede deshacer.
          </AlertDialogDescription>
          <label className="grid gap-2 text-sm font-medium">
            Escribe {deleteConfirmation}
            <input
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
              onChange={(event) => setConfirmation(event.target.value)}
              value={confirmation}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button disabled={pending} onClick={() => setDeleteOpen(false)} type="button" variant="outline">
              Cancelar
            </Button>
            <Button
              disabled={pending || confirmation !== deleteConfirmation}
              onClick={() => submitBulk(deleteAction, { confirmation })}
              type="button"
            >
              Eliminar permanentemente
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function IndeterminateCheckbox({
  ariaLabel,
  checked,
  disabled,
  indeterminate,
  onChange,
}: {
  ariaLabel: string;
  checked: boolean;
  disabled?: boolean;
  indeterminate: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      aria-label={ariaLabel}
      checked={checked}
      className="h-4 w-4"
      disabled={disabled}
      onChange={onChange}
      ref={ref}
      type="checkbox"
    />
  );
}
