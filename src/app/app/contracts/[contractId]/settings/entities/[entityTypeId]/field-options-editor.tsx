"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Search, TextCursorInput, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  createOptionRow,
  filterOptionRows,
  getDuplicateOptionErrors,
  getOptionSummary,
  initialOptionRows,
  moveOption,
  parseBulkOptions,
  removePersistedOption,
  removeNewOption,
  toggleOptionActive,
  updateOptionLabel,
  updateOptionValue,
  type FieldOptionEditorRow,
} from "@/lib/field-options-editor-state";
import {
  FIELD_OPTIONS_PAYLOAD_NAME,
  MAX_FIELD_OPTIONS_MESSAGE,
  normalizeFieldKey,
  serializeFieldOptionsPayload,
  type FieldOptionDraft,
} from "@/lib/field-editor-state";

type OptionActionContext = {
  contractId: string;
  entityTypeId: string;
  fieldId: string;
};

type DeleteOptionAction = (
  contractId: string,
  entityTypeId: string,
  fieldId: string,
  optionId: string,
) => Promise<{ success: boolean; message: string }>;

export function FieldOptionsEditor({
  actionContext,
  deleteOptionAction,
  fieldErrors,
  initialOptions,
}: {
  actionContext?: OptionActionContext;
  deleteOptionAction?: DeleteOptionAction;
  fieldErrors: Record<string, string[]>;
  initialOptions?: Array<
    FieldOptionDraft & { id?: string; hasValues?: boolean; usageCount?: number; editing?: boolean }
  >;
}) {
  const [rows, setRows] = useState<FieldOptionEditorRow[]>(() =>
    initialOptionRows(initialOptions),
  );
  const [pendingDelete, startDeleteTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<FieldOptionEditorRow | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const duplicateErrors = useMemo(() => getDuplicateOptionErrors(rows), [rows]);
  const filteredRows = useMemo(() => filterOptionRows(rows, query), [rows, query]);
  const bulkResult = useMemo(() => parseBulkOptions(bulkText, rows), [bulkText, rows]);
  const summary = getOptionSummary(rows);

  function addOption() {
    setRows((current) => [
      ...current,
      createOptionRow("", { sortOrder: current.length + 1 }),
    ]);
  }

  function addBulkOptions() {
    if (bulkResult.rows.length === 0) {
      return;
    }

    if (bulkResult.limitExceeded) {
      return;
    }

    setRows((current) => [
      ...current,
      ...bulkResult.rows.map((row, index) => ({
        ...row,
        sortOrder: current.length + index + 1,
      })),
    ]);
    setBulkText("");
    setShowBulk(false);
  }

  function updateRow(rowKey: string, patch: Partial<FieldOptionEditorRow>) {
    setRows((current) =>
      current.map((row) => (row.rowKey === rowKey ? { ...row, ...patch } : row)),
    );
  }

  function confirmDeleteOption() {
    if (!deleteTarget?.id || !actionContext || !deleteOptionAction) {
      return;
    }

    startDeleteTransition(async () => {
      const result = await deleteOptionAction(
        actionContext.contractId,
        actionContext.entityTypeId,
        actionContext.fieldId,
        deleteTarget.id!,
      );

      if (result.success) {
        setRows((current) => removePersistedOption(current, deleteTarget.rowKey));
        setDeleteTarget(null);
      }

      setFeedback({
        tone: result.success ? "success" : "error",
        message: result.message,
      });
    });
  }

  return (
    <section className="grid gap-4 rounded-md border border-border p-4 lg:col-span-2">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Opciones</h3>
          <p className="text-xs text-muted-foreground">
            Administra las opciones disponibles para este campo.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.totalCount} opciones · {summary.activeCount} activas · {summary.inactiveCount} inactivas
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={addOption} type="button" variant="outline">
            <Plus aria-hidden="true" className="h-4 w-4" />
            Agregar opción
          </Button>
          <Button onClick={() => setShowBulk(true)} type="button" variant="outline">
            <TextCursorInput aria-hidden="true" className="h-4 w-4" />
            Pegar lista
          </Button>
        </div>
      </div>

      <FieldError errors={fieldErrors.options} />
      {feedback ? (
        <p
          aria-live="polite"
          className={
            feedback.tone === "success"
              ? "text-xs font-medium text-emerald-700"
              : "text-xs font-medium text-destructive"
          }
        >
          {feedback.message}
        </p>
      ) : null}

      <HiddenOptionInputs rows={rows} />

      {showBulk ? (
        <BulkOptionsInput
          duplicateCount={bulkResult.duplicateCount}
          newCount={bulkResult.rows.length}
          detectedCount={bulkResult.detectedCount}
          errorMessage={bulkResult.limitExceeded ? MAX_FIELD_OPTIONS_MESSAGE : undefined}
          onAdd={addBulkOptions}
          onCancel={() => {
            setBulkText("");
            setShowBulk(false);
          }}
          onChange={setBulkText}
          value={bulkText}
        />
      ) : null}

      {rows.length > 10 ? (
        <label className="grid gap-2 text-sm font-medium">
          Buscar opciones
          <div className="flex items-center gap-2 rounded-md border border-input px-3">
            <Search aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            <input
              className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar opciones..."
              value={query}
            />
          </div>
        </label>
      ) : null}

      {rows.length === 0 ? (
        <div className="grid gap-3 rounded-md border border-dashed border-border p-5">
          <div>
            <p className="text-sm font-medium">Aún no hay opciones</p>
            <p className="text-sm text-muted-foreground">
              Agrega opciones individualmente o pega una lista completa.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={addOption} type="button" variant="outline">
              Agregar opción
            </Button>
            <Button onClick={() => setShowBulk(true)} type="button" variant="outline">
              Pegar lista
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          {filteredRows.map((row) => {
            const index = rows.findIndex((item) => item.rowKey === row.rowKey);

            return (
              <FieldOptionRow
                duplicateError={duplicateErrors[row.rowKey]}
                index={index}
                isLast={index === rows.length - 1}
                key={row.rowKey}
                onEdit={() => updateRow(row.rowKey, { editing: true })}
                onCancelEdit={() => updateRow(row.rowKey, { editing: false })}
                onMove={(direction) => setRows((current) => moveOption(current, index, direction))}
                onRemove={() => setRows((current) => removeNewOption(current, row.rowKey))}
                onToggleActive={() =>
                  setRows((current) => toggleOptionActive(current, row.rowKey))
                }
                onDelete={() => setDeleteTarget(row)}
                onUpdate={(nextRow) => updateRow(row.rowKey, nextRow)}
                row={row}
              />
            );
          })}
        </div>
      )}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !pendingDelete) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <div className="grid gap-2">
            <AlertDialogTitle>Eliminar opción</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente la opción «{deleteTarget?.label ?? ""}». Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              disabled={pendingDelete}
              onClick={() => setDeleteTarget(null)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button disabled={pendingDelete} onClick={confirmDeleteOption} type="button">
              {pendingDelete ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
              Eliminar opción
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function HiddenOptionInputs({ rows }: { rows: FieldOptionEditorRow[] }) {
  return (
    <div hidden>
      <input
        name={FIELD_OPTIONS_PAYLOAD_NAME}
        readOnly
        value={serializeFieldOptionsPayload(rows)}
      />
      {rows.map((row) => (
        <div key={row.rowKey}>
          <input name="optionRowKey" readOnly value={row.rowKey} />
          {row.id ? <input name={`optionId:${row.rowKey}`} readOnly value={row.id} /> : null}
          <input name={`optionSortOrder:${row.rowKey}`} readOnly value={row.sortOrder} />
          <input name={`optionLabel:${row.rowKey}`} readOnly value={row.label} />
          <input name={`optionValue:${row.rowKey}`} readOnly value={row.value} />
          <input
            name={`optionActive:${row.rowKey}`}
            readOnly
            value={row.isActive ? "true" : "false"}
          />
        </div>
      ))}
    </div>
  );
}

function FieldOptionRow({
  duplicateError,
  index,
  isLast,
  onCancelEdit,
  onEdit,
  onMove,
  onRemove,
  onDelete,
  onToggleActive,
  onUpdate,
  row,
}: {
  duplicateError?: string;
  index: number;
  isLast: boolean;
  onCancelEdit: () => void;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  onUpdate: (row: Partial<FieldOptionEditorRow>) => void;
  row: FieldOptionEditorRow;
}) {
  if (row.editing) {
    return (
      <div className="grid gap-3 rounded-md border border-border p-3">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="grid gap-2 text-sm font-medium">
            Etiqueta visible
            <input
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
              onChange={(event) => onUpdate(updateOptionLabel(row, event.target.value))}
              value={row.label}
            />
          </label>
          <details className="grid gap-2">
            <summary className="cursor-pointer text-sm font-medium">Editar valor interno</summary>
            <label className="mt-2 grid gap-2 text-sm font-medium">
              Valor interno
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2 disabled:opacity-60"
                disabled={row.hasValues}
                onChange={(event) => onUpdate(updateOptionValue(row, event.target.value))}
                value={row.value}
              />
              {row.hasValues ? (
                <span className="text-xs text-muted-foreground">
                  No puedes modificar el valor interno porque esta opción ya está siendo utilizada.
                </span>
              ) : null}
            </label>
          </details>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onCancelEdit} type="button" variant="outline">
              Listo
            </Button>
          </div>
        </div>
        {duplicateError ? (
          <p aria-live="polite" className="text-xs font-medium text-destructive">
            {duplicateError}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[auto_1fr_auto] md:items-center">
      <div className="flex gap-2">
        <Button
          aria-label={`Mover ${row.label || "opción"} hacia arriba`}
          disabled={index === 0}
          onClick={() => onMove(-1)}
          size="icon"
          type="button"
          variant="outline"
        >
          <ArrowUp aria-hidden="true" className="h-4 w-4" />
        </Button>
        <Button
          aria-label={`Mover ${row.label || "opción"} hacia abajo`}
          disabled={isLast}
          onClick={() => onMove(1)}
          size="icon"
          type="button"
          variant="outline"
        >
          <ArrowDown aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-w-0">
        <div className="font-medium">{row.label || "Opción sin etiqueta"}</div>
        <div className="break-all text-xs text-muted-foreground">{row.value || normalizeFieldKey(row.label)}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {row.isActive ? "Activa" : "Inactiva"}
        </div>
        {duplicateError ? (
          <p aria-live="polite" className="mt-1 text-xs font-medium text-destructive">
            {duplicateError}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        <Button onClick={onEdit} size="sm" type="button" variant="outline">
          <Pencil aria-hidden="true" className="h-4 w-4" />
          Editar
        </Button>
        {row.id ? (
          <>
            <Button onClick={onToggleActive} size="sm" type="button" variant="outline">
              {row.isActive ? "Desactivar" : "Activar"}
            </Button>
            <Button
              disabled={(row.usageCount ?? 0) > 0}
              onClick={onDelete}
              size="sm"
              title={
                (row.usageCount ?? 0) > 0
                  ? `No puedes eliminar esta opción porque está siendo utilizada en ${row.usageCount} registros.`
                  : undefined
              }
              type="button"
              variant="outline"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              Eliminar
            </Button>
          </>
        ) : (
          <Button onClick={onRemove} size="sm" type="button" variant="ghost">
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            Quitar
          </Button>
        )}
      </div>
      {row.id && !row.isActive ? (
        <p className="text-xs text-muted-foreground md:col-start-2 md:col-end-4">
          La opción dejará de estar disponible para nuevos registros. Los valores existentes se conservarán.
        </p>
      ) : null}
      {row.id && (row.usageCount ?? 0) > 0 ? (
        <p className="text-xs text-muted-foreground md:col-start-2 md:col-end-4">
          No puedes eliminar esta opción porque está siendo utilizada en {row.usageCount} registros.
        </p>
      ) : null}
    </div>
  );
}

function BulkOptionsInput({
  detectedCount,
  duplicateCount,
  newCount,
  errorMessage,
  onAdd,
  onCancel,
  onChange,
  value,
}: {
  detectedCount: number;
  duplicateCount: number;
  newCount: number;
  errorMessage?: string;
  onAdd: () => void;
  onCancel: () => void;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="grid gap-3 rounded-md border border-border p-4">
      <div>
        <h4 className="text-sm font-semibold">Agregar varias opciones</h4>
        <p className="text-xs text-muted-foreground">
          Escribe o pega una opción por línea.
        </p>
      </div>
      <label className="grid gap-2 text-sm font-medium">
        Lista de opciones
        <textarea
          aria-describedby="bulk-options-help"
          className="min-h-44 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus-visible:ring-2"
          onChange={(event) => onChange(event.target.value)}
          placeholder={"Operativo\nEn mantención\nFuera de servicio"}
          value={value}
        />
      </label>
      <p className="text-xs text-muted-foreground" id="bulk-options-help">
        {detectedCount} líneas detectadas · {newCount} opciones nuevas · {duplicateCount} duplicadas omitidas
      </p>
      {errorMessage ? (
        <p aria-live="polite" className="text-xs font-medium text-destructive">
          {errorMessage}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="outline">
          Cancelar
        </Button>
        <Button disabled={newCount === 0 || Boolean(errorMessage)} onClick={onAdd} type="button">
          Agregar opciones
        </Button>
      </div>
    </div>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) {
    return null;
  }

  return <p className="text-xs font-medium text-destructive">{errors[0]}</p>;
}
