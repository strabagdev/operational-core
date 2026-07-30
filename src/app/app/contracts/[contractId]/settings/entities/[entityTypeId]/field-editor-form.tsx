"use client";

import * as React from "react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { EntityFieldType } from "@prisma/client";
import { Loader2 } from "lucide-react";

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
import {
  buildRelationSummary,
  getCreateFieldDefaults,
  multipleFieldTypes,
  normalizeFieldKey,
  optionFieldTypes,
  primaryCompatibleFieldTypes,
  type FieldEditorActionState,
  type FieldOptionDraft,
} from "@/lib/field-editor-state";

const fieldTypes: EntityFieldType[] = [
  "TEXT",
  "TEXTAREA",
  "INTEGER",
  "DECIMAL",
  "MONEY",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "SELECT",
  "MULTISELECT",
  "EMAIL",
  "PHONE",
  "URL",
  "FILE",
  "IMAGE",
  "RELATION",
];

const fieldTypeLabels: Record<EntityFieldType, string> = {
  TEXT: "Texto corto",
  TEXTAREA: "Texto largo",
  INTEGER: "Número entero",
  DECIMAL: "Número decimal",
  MONEY: "Monto",
  BOOLEAN: "Sí / No",
  DATE: "Fecha",
  DATETIME: "Fecha y hora",
  SELECT: "Lista de opciones",
  MULTISELECT: "Selección múltiple",
  EMAIL: "Correo electrónico",
  PHONE: "Teléfono",
  URL: "Enlace",
  FILE: "Archivo",
  IMAGE: "Imagen",
  RELATION: "Relación con otra entidad",
};

const fieldTypeDescriptions: Record<EntityFieldType, string> = {
  TEXT: "Para nombres, códigos o textos breves.",
  TEXTAREA: "Para observaciones o descripciones extensas.",
  INTEGER: "Para cantidades sin decimales.",
  DECIMAL: "Para números con decimales.",
  MONEY: "Para valores monetarios.",
  BOOLEAN: "Para respuestas de sí o no.",
  DATE: "Para fechas sin hora.",
  DATETIME: "Para fecha y hora.",
  SELECT: "Permite elegir una opción predefinida.",
  MULTISELECT: "Permite seleccionar varias opciones.",
  EMAIL: "Valida una dirección de correo.",
  PHONE: "Para teléfonos de contacto.",
  URL: "Para enlaces y sitios web.",
  FILE: "Archivo con soporte limitado en esta etapa.",
  IMAGE: "Imagen con soporte limitado en esta etapa.",
  RELATION: "Conecta este registro con registros de otra entidad.",
};

type EntityTypeOption = { id: string; name: string };

type FieldEditorFormValues = {
  name?: string;
  key?: string;
  description?: string | null;
  type?: EntityFieldType;
  required?: boolean;
  isUnique?: boolean;
  searchable?: boolean;
  multiple?: boolean;
  isActive?: boolean;
  targetEntityTypeId?: string;
  relationKind?: "ONE" | "MANY";
  validation?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    regex?: { pattern?: string; message?: string };
  };
  defaultValue?: unknown;
  display?: {
    primary?: boolean;
    showInList?: boolean;
    listOrder?: number;
  };
  options?: Array<FieldOptionDraft & { id?: string; hasValues?: boolean }>;
  hasValues?: boolean;
};

export function FieldEditorFormSheet({
  action,
  closeHref,
  defaultValues,
  description,
  entityName,
  entityTypes,
  fieldCount,
  formId,
  hasPrimary,
  mode,
  returnTo,
  successTo,
  summary,
  title,
}: {
  action: (
    state: FieldEditorActionState,
    formData: FormData,
  ) => Promise<FieldEditorActionState>;
  closeHref: string;
  defaultValues?: FieldEditorFormValues;
  description: string;
  entityName: string;
  entityTypes: EntityTypeOption[];
  fieldCount: number;
  formId: string;
  hasPrimary: boolean;
  mode: "create" | "edit";
  returnTo: string;
  successTo: string;
  summary: string;
  title: string;
}) {
  const router = useRouter();
  const initialState: FieldEditorActionState = { success: false };
  const [state, formAction, actionPending] = useActionState(action, initialState);
  const [showDiscard, setShowDiscard] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [clientErrors, setClientErrors] = useState<Record<string, string[]>>({});
  const firstErrorRef = useRef<HTMLElement | null>(null);
  const fieldErrors = useMemo(
    () => ({ ...(state.fieldErrors ?? {}), ...clientErrors }),
    [clientErrors, state.fieldErrors],
  );

  useEffect(() => {
    if (!state.message && Object.keys(fieldErrors).length === 0) {
      return;
    }

    firstErrorRef.current?.focus();
  }, [state.message, fieldErrors]);

  function requestClose() {
    if (actionPending) {
      return;
    }

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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const nextErrors = validateClientForm(formData);

    if (Object.keys(nextErrors).length > 0) {
      event.preventDefault();
      setClientErrors(nextErrors);
      return;
    }

    setClientErrors({});
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
            if (actionPending || dirty) {
              event.preventDefault();
              requestClose();
            }
          }}
          onInteractOutside={(event) => {
            if (actionPending || dirty) {
              event.preventDefault();
              requestClose();
            }
          }}
        >
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
            <p className="text-xs font-medium text-muted-foreground">{summary}</p>
          </SheetHeader>
          <form
            action={formAction}
            className="contents"
            id={formId}
            onChange={() => setDirty(true)}
            onSubmit={handleSubmit}
          >
            <input name="returnTo" type="hidden" value={returnTo} />
            <input name="successTo" type="hidden" value={successTo} />
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <FieldEditorControls
                defaultValues={defaultValues}
                entityName={entityName}
                entityTypes={entityTypes}
                fieldCount={fieldCount}
                fieldErrors={fieldErrors}
                setFirstErrorRef={(element) => {
                  if (element && !firstErrorRef.current) {
                    firstErrorRef.current = element;
                  }
                }}
                hasPrimary={hasPrimary}
                mode={mode}
              />
              {state.message ? (
                <div
                  aria-live="polite"
                  className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  {state.message}
                </div>
              ) : null}
            </div>
            <SheetFooter className="flex justify-end gap-2">
              <Button
                disabled={actionPending}
                onClick={requestClose}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <SubmitButton mode={mode} submitting={actionPending} />
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

function FieldEditorControls({
  defaultValues,
  entityName,
  entityTypes,
  fieldCount,
  fieldErrors,
  setFirstErrorRef,
  hasPrimary,
  mode,
}: {
  defaultValues?: FieldEditorFormValues;
  entityName: string;
  entityTypes: EntityTypeOption[];
  fieldCount: number;
  fieldErrors: Record<string, string[]>;
  setFirstErrorRef: (element: HTMLElement | null) => void;
  hasPrimary: boolean;
  mode: "create" | "edit";
}) {
  const initialType = defaultValues?.type ?? "TEXT";
  const createDefaults = getCreateFieldDefaults({ fieldCount, hasPrimary, type: initialType });
  const [type, setType] = useState<EntityFieldType>(initialType);
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [key, setKey] = useState(defaultValues?.key ?? normalizeFieldKey(defaultValues?.name ?? ""));
  const [keyTouched, setKeyTouched] = useState(mode === "edit" || Boolean(defaultValues?.key));
  const [required, setRequired] = useState(defaultValues?.required ?? createDefaults.required);
  const [isUnique, setIsUnique] = useState(defaultValues?.isUnique ?? createDefaults.isUnique);
  const [searchable, setSearchable] = useState(
    defaultValues?.searchable ?? createDefaults.searchable,
  );
  const [multiple, setMultiple] = useState(defaultValues?.multiple ?? createDefaults.multiple);
  const [isActive, setIsActive] = useState(defaultValues?.isActive ?? createDefaults.isActive);
  const [displayPrimary, setDisplayPrimary] = useState(
    defaultValues?.display?.primary ?? createDefaults.displayPrimary,
  );
  const [displayShowInList, setDisplayShowInList] = useState(
    defaultValues?.display?.showInList ?? createDefaults.displayShowInList,
  );
  const [targetEntityTypeId, setTargetEntityTypeId] = useState(
    defaultValues?.targetEntityTypeId ?? "",
  );
  const [relationKind, setRelationKind] = useState<"ONE" | "MANY">(
    defaultValues?.relationKind ?? "ONE",
  );
  const [options, setOptions] = useState(() => initialOptionRows(defaultValues?.options));
  const hasFieldData = Boolean(
    defaultValues?.options?.some((option) => option.hasValues) ||
      (mode === "edit" && defaultValues?.hasValues),
  );
  const typeLocked = mode === "edit" && hasFieldData;
  const supportsPrimary = primaryCompatibleFieldTypes.has(type);
  const supportsMultiple = multipleFieldTypes.has(type);
  const relationTarget = entityTypes.find((entityType) => entityType.id === targetEntityTypeId);

  function changeType(nextType: EntityFieldType) {
    setType(nextType);
    const defaults = getCreateFieldDefaults({ fieldCount, hasPrimary, type: nextType });

    if (mode === "create") {
      setMultiple(defaults.multiple);
      setDisplayPrimary(defaults.displayPrimary);
      setDisplayShowInList(defaults.displayShowInList);
      setSearchable(defaults.searchable);
    }

    if (!multipleFieldTypes.has(nextType)) {
      setMultiple(false);
    }
  }

  function setPrimary(nextValue: boolean) {
    setDisplayPrimary(nextValue);

    if (nextValue) {
      setDisplayShowInList(true);
      setSearchable(true);
    }
  }

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-md border border-border p-4">
        <SectionIntro
          description="Define cómo se llamará el campo y qué tipo de información guardará."
          title="Información básica"
        />
        <FieldError errors={fieldErrors.name} />
        <label className="grid gap-2 text-sm font-medium">
          Nombre
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
            name="name"
            onChange={(event) => {
              setName(event.target.value);
              if (!keyTouched) {
                setKey(normalizeFieldKey(event.target.value));
              }
            }}
            ref={fieldErrors.name ? setFirstErrorRef : undefined}
            required
            value={name}
          />
        </label>
        <FieldError errors={fieldErrors.type} />
        <label className="grid gap-2 text-sm font-medium">
          Tipo
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            disabled={typeLocked}
            name="type"
            onChange={(event) => changeType(event.target.value as EntityFieldType)}
            ref={fieldErrors.type ? setFirstErrorRef : undefined}
            value={type}
          >
            {fieldTypes.map((fieldType) => (
              <option key={fieldType} value={fieldType}>
                {fieldTypeLabels[fieldType]}
              </option>
            ))}
          </select>
          {typeLocked ? (
            <input name="type" type="hidden" value={type} />
          ) : null}
          <span className="text-xs text-muted-foreground">{fieldTypeDescriptions[type]}</span>
          {typeLocked ? (
            <span className="text-xs text-muted-foreground">
              No puedes cambiar el tipo porque este campo ya contiene información.
            </span>
          ) : null}
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Descripción
          <textarea
            className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus-visible:ring-2"
            defaultValue={defaultValues?.description ?? ""}
            name="description"
          />
        </label>
        <details>
          <summary className="cursor-pointer text-sm font-medium">Configuración avanzada</summary>
          <div className="mt-3 grid gap-2">
            <FieldError errors={fieldErrors.key} />
            <label className="grid gap-2 text-sm font-medium">
              Identificador interno
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
                name="key"
                onChange={(event) => {
                  setKeyTouched(true);
                  setKey(normalizeFieldKey(event.target.value));
                }}
                ref={fieldErrors.key ? setFirstErrorRef : undefined}
                required
                value={key}
              />
              <span className="text-xs text-muted-foreground">
                {mode === "edit"
                  ? "Modificarlo puede afectar integraciones o referencias que usen este identificador."
                  : "Se utiliza internamente para identificar el campo. Normalmente no necesitas modificarlo."}
              </span>
            </label>
          </div>
        </details>
      </section>

      {optionFieldTypes.has(type) ? (
        <OptionsSection fieldErrors={fieldErrors} options={options} setOptions={setOptions} />
      ) : null}

      {type === "RELATION" ? (
        <section className="grid gap-3 rounded-md border border-border p-4">
          <SectionIntro
            description="Conecta estos registros con registros de otra entidad."
            title="Configuración del tipo"
          />
          <FieldError errors={fieldErrors.targetEntityTypeId} />
          <label className="grid gap-2 text-sm font-medium">
            Entidad relacionada
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              name="targetEntityTypeId"
              onChange={(event) => setTargetEntityTypeId(event.target.value)}
              ref={fieldErrors.targetEntityTypeId ? setFirstErrorRef : undefined}
              required
              value={targetEntityTypeId}
            >
              <option value="">Selecciona una entidad</option>
              {entityTypes.map((entityType) => (
                <option key={entityType.id} value={entityType.id}>
                  {entityType.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Tipo de relación
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              name="relationKind"
              onChange={(event) => setRelationKind(event.target.value as "ONE" | "MANY")}
              value={relationKind}
            >
              <option value="ONE">Una relación</option>
              <option value="MANY">Varias relaciones</option>
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            {buildRelationSummary({
              sourceName: entityName,
              targetName: relationTarget?.name,
              relationKind,
            })}
          </p>
        </section>
      ) : null}

      <section className="grid gap-3 rounded-md border border-border p-4">
        <SectionIntro
          description="Ajusta cómo se comporta este campo en los registros."
          title="Comportamiento"
        />
        <CheckboxControl checked={required} label="Obligatorio" name="required" onChange={setRequired} />
        <CheckboxControl
          checked={isUnique}
          label="No permitir repetidos"
          name="isUnique"
          onChange={setIsUnique}
        />
        <CheckboxControl
          checked={searchable}
          label="Incluir en búsquedas"
          name="searchable"
          onChange={setSearchable}
        />
        {supportsMultiple ? (
          <CheckboxControl
            checked={multiple}
            label="Permitir varios valores"
            name="multiple"
            onChange={setMultiple}
          />
        ) : null}
        <CheckboxControl checked={isActive} label="Activo" name="isActive" onChange={setIsActive} />
      </section>

      <section className="grid gap-3 rounded-md border border-border p-4">
        <SectionIntro
          description="Controla cómo este campo participa en listados y en la identidad visible del registro."
          title="Presentación"
        />
        <FieldError errors={fieldErrors.displayPrimary} />
        {supportsPrimary ? (
          <CheckboxControl
            checked={displayPrimary}
            label="Campo principal"
            name="displayPrimary"
            onChange={setPrimary}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Este tipo puede mostrarse como columna, pero no puede identificar el registro.
          </p>
        )}
        <CheckboxControl
          checked={displayShowInList}
          disabled={displayPrimary}
          label="Mostrar en listado"
          name="displayShowInList"
          onChange={setDisplayShowInList}
        />
        {displayPrimary ? <input name="displayShowInList" type="hidden" value="on" /> : null}
        <label className="grid gap-2 text-sm font-medium">
          Orden en listado
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={defaultValues?.display?.listOrder ?? ""}
            min={0}
            name="displayListOrder"
            placeholder="Usa el orden del campo"
            type="number"
          />
        </label>
      </section>

      <details className="grid gap-3 rounded-md border border-border p-4">
        <summary className="cursor-pointer list-none">
          <SectionIntro
            description="Reglas avanzadas que se aplican siempre en el servidor."
            title="Validaciones avanzadas"
          />
        </summary>
        <div className="mt-3 grid gap-3">
          <CheckboxControl
            checked={defaultValues?.validation?.required ?? false}
            label="Obligatorio en validación"
            name="validationRequired"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <NumberInput defaultValue={defaultValues?.validation?.minLength} label="Longitud mínima" name="validationMinLength" />
            <NumberInput defaultValue={defaultValues?.validation?.maxLength} label="Longitud máxima" name="validationMaxLength" />
            <NumberInput defaultValue={defaultValues?.validation?.minimum} label="Valor mínimo" name="validationMinimum" step="any" />
            <NumberInput defaultValue={defaultValues?.validation?.maximum} label="Valor máximo" name="validationMaximum" step="any" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <TextInput
              defaultValue={defaultValues?.validation?.regex?.pattern}
              label="Formato esperado"
              name="validationRegexPattern"
              placeholder="^[A-Z0-9-]+$"
            />
            <TextInput
              defaultValue={defaultValues?.validation?.regex?.message}
              label="Mensaje del patrón"
              name="validationRegexMessage"
              placeholder="Use solo mayúsculas, números y guiones"
            />
          </div>
        </div>
      </details>
    </div>
  );
}

function OptionsSection({
  fieldErrors,
  options,
  setOptions,
}: {
  fieldErrors: Record<string, string[]>;
  options: Array<FieldOptionDraft & { rowKey: string; hasValues?: boolean }>;
  setOptions: React.Dispatch<
    React.SetStateAction<Array<FieldOptionDraft & { rowKey: string; hasValues?: boolean }>>
  >;
}) {
  function updateOption(rowKey: string, patch: Partial<FieldOptionDraft>) {
    setOptions((current) =>
      current.map((option) => (option.rowKey === rowKey ? { ...option, ...patch } : option)),
    );
  }

  function addOption() {
    setOptions((current) => [
      ...current,
      {
        rowKey: crypto.randomUUID(),
        label: "",
        value: "",
        sortOrder: current.length + 1,
        isActive: true,
      },
    ]);
  }

  function moveOption(index: number, direction: -1 | 1) {
    setOptions((current) => {
      const next = [...current];
      const target = index + direction;

      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];

      return next.map((option, optionIndex) => ({
        ...option,
        sortOrder: optionIndex + 1,
      }));
    });
  }

  return (
    <section className="grid gap-3 rounded-md border border-border p-4">
      <SectionIntro
        description="Define las alternativas disponibles para nuevos registros."
        title="Configuración del tipo"
      />
      <FieldError errors={fieldErrors.options} />
      <div className="grid gap-3">
        {options.map((option, index) => (
          <div className="grid gap-3 rounded-md border border-border p-3" key={option.rowKey}>
            <input name="optionRowKey" type="hidden" value={option.rowKey} />
            {option.id ? (
              <input name={`optionId:${option.rowKey}`} type="hidden" value={option.id} />
            ) : null}
            <input
              name={`optionSortOrder:${option.rowKey}`}
              type="hidden"
              value={option.sortOrder}
            />
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <label className="grid gap-2 text-sm font-medium">
                Etiqueta visible
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  name={`optionLabel:${option.rowKey}`}
                  onChange={(event) => {
                    const label = event.target.value;
                    updateOption(option.rowKey, {
                      label,
                      value: option.value ? option.value : normalizeFieldKey(label),
                    });
                  }}
                  required
                  value={option.label}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Valor interno
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
                  disabled={option.hasValues}
                  name={`optionValue:${option.rowKey}`}
                  onChange={(event) =>
                    updateOption(option.rowKey, { value: normalizeFieldKey(event.target.value) })
                  }
                  required
                  value={option.value}
                />
                {option.hasValues ? (
                  <>
                    <input
                      name={`optionValue:${option.rowKey}`}
                      type="hidden"
                      value={option.value}
                    />
                    <span className="text-xs text-muted-foreground">
                      No puedes cambiarlo porque ya existen valores registrados.
                    </span>
                  </>
                ) : null}
              </label>
              <div className="flex items-end gap-2">
                <Button
                  disabled={index === 0}
                  onClick={() => moveOption(index, -1)}
                  type="button"
                  variant="outline"
                >
                  Subir
                </Button>
                <Button
                  disabled={index === options.length - 1}
                  onClick={() => moveOption(index, 1)}
                  type="button"
                  variant="outline"
                >
                  Bajar
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CheckboxControl
                checked={option.isActive}
                label={option.isActive ? "Activa" : "Inactiva"}
                name={`optionActive:${option.rowKey}`}
                onChange={(value) => updateOption(option.rowKey, { isActive: value })}
              />
              {option.id ? (
                <p className="text-xs text-muted-foreground">
                  La opción inactiva deja de estar disponible para nuevos registros; los valores existentes se conservan.
                </p>
              ) : (
                <Button
                  onClick={() =>
                    setOptions((current) =>
                      current.filter((item) => item.rowKey !== option.rowKey),
                    )
                  }
                  type="button"
                  variant="ghost"
                >
                  Quitar
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <Button onClick={addOption} type="button" variant="outline">
        Agregar opción
      </Button>
    </section>
  );
}

function SubmitButton({
  mode,
  submitting,
}: {
  mode: "create" | "edit";
  submitting: boolean;
}) {
  const status = useFormStatus();
  const pending = status.pending || submitting;

  return (
    <Button disabled={pending} type="submit">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? (mode === "create" ? "Creando..." : "Guardando...") : mode === "create" ? "Crear campo" : "Guardar cambios"}
    </Button>
  );
}

function CheckboxControl({
  checked,
  disabled,
  label,
  name,
  onChange,
}: {
  checked?: boolean;
  disabled?: boolean;
  label: string;
  name: string;
  onChange?: (checked: boolean) => void;
}) {
  const [localChecked, setLocalChecked] = useState(Boolean(checked));
  const value = onChange ? Boolean(checked) : localChecked;

  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        checked={value}
        className="h-4 w-4"
        disabled={disabled}
        name={name}
        onChange={(event) => {
          setLocalChecked(event.target.checked);
          onChange?.(event.target.checked);
        }}
        type="checkbox"
      />
      {label}
    </label>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;

  return <p className="text-xs font-medium text-destructive">{errors[0]}</p>;
}

function SectionIntro({ description, title }: { description: string; title: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function NumberInput({
  defaultValue,
  label,
  name,
  step,
}: {
  defaultValue?: number;
  label: string;
  name: string;
  step?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        defaultValue={defaultValue ?? ""}
        min={0}
        name={name}
        step={step}
        type="number"
      />
    </label>
  );
}

function TextInput({
  defaultValue,
  label,
  name,
  placeholder,
}: {
  defaultValue?: string;
  label: string;
  name: string;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        defaultValue={defaultValue ?? ""}
        name={name}
        placeholder={placeholder}
      />
    </label>
  );
}

function initialOptionRows(options?: FieldEditorFormValues["options"]) {
  const rows =
    options && options.length > 0
      ? options.map((option) => ({
          ...option,
          rowKey: option.id ?? crypto.randomUUID(),
        }))
      : [
          {
            rowKey: crypto.randomUUID(),
            label: "",
            value: "",
            sortOrder: 1,
            isActive: true,
          },
        ];

  return rows;
}

function validateClientForm(formData: FormData) {
  const errors: Record<string, string[]> = {};
  const type = formData.get("type");

  if ((type === "SELECT" || type === "MULTISELECT") && formData.getAll("optionRowKey").length === 0) {
    errors.options = ["Debes agregar al menos una opción."];
  }

  if (type === "RELATION" && !String(formData.get("targetEntityTypeId") ?? "").trim()) {
    errors.targetEntityTypeId = ["Selecciona la entidad relacionada."];
  }

  return errors;
}
