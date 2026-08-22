"use client";

import { useActionState, useMemo, useState } from "react";
import type { AppViewType } from "@prisma/client";

import { EntityIcon } from "@/components/entity-icon";
import { Button } from "@/components/ui/button";
import {
  appViewTypeOptions,
  appViewWorkflowOptions,
  type AppViewConfig,
  suggestedAppViewSlug,
} from "@/lib/app-views";
import { entityIconOptions } from "@/lib/entity-icons";

import type { AppViewActionState } from "./actions";

type AppViewEntityTypeOption = {
  fields: Array<{
    id: string;
    isActive: boolean;
    key: string;
    name: string;
    options: Array<{
      id: string;
      isActive: boolean;
      label: string;
      value: string;
    }>;
    type: string;
  }>;
  icon?: string | null;
  id: string;
  name: string;
};

type AppViewFormProps = {
  action: (
    state: AppViewActionState,
    formData: FormData,
  ) => Promise<AppViewActionState>;
  entityTypes: AppViewEntityTypeOption[];
  initialActionState?: AppViewActionState;
  initialValues?: {
    active: boolean;
    config: AppViewConfig;
    icon?: string | null;
    name: string;
    slug: string;
    sortOrder: number;
    type: AppViewType;
  };
  submitLabel: string;
};

export function AppViewForm({
  action,
  entityTypes,
  initialActionState,
  initialValues,
  submitLabel,
}: AppViewFormProps) {
  const [state, formAction, actionPending] = useActionState(
    action,
    initialActionState ?? { success: false },
  );
  const [name, setName] = useState(valueFromState(state, "name", initialValues?.name ?? ""));
  const [slug, setSlug] = useState(valueFromState(state, "slug", initialValues?.slug ?? ""));
  const [slugTouched, setSlugTouched] = useState(Boolean(initialValues?.slug));
  const [type, setType] = useState<AppViewType>(
    valueFromState(state, "type", initialValues?.type ?? "RECORDS") as AppViewType,
  );
  const [entityTypeId, setEntityTypeId] = useState(
    valueFromState(state, "entityTypeId") ||
    (initialValues?.config.type === "RECORDS" || initialValues?.config.type === "BOARD"
      ? initialValues.config.entityTypeId
      : entityTypes[0]?.id ?? ""),
  );
  const [sourceEntityTypeId, setSourceEntityTypeId] = useState(
    valueFromState(state, "sourceEntityTypeId") ||
    (initialValues?.config.type === "WORKFLOW"
      ? initialValues.config.sourceEntityTypeId
      : entityTypes[0]?.id ?? ""),
  );
  const [targetEntityTypeId, setTargetEntityTypeId] = useState(
    valueFromState(state, "targetEntityTypeId") ||
    (initialValues?.config.type === "WORKFLOW"
      ? initialValues.config.targetEntityTypeId
      : entityTypes[0]?.id ?? ""),
  );
  const targetEntityType = entityTypes.find((entityType) => entityType.id === targetEntityTypeId);
  const [personFieldId, setPersonFieldId] = useState(
    valueFromState(state, "personFieldId") ||
    (initialValues?.config.type === "WORKFLOW"
      ? initialValues.config.personFieldId
      : firstActiveFieldId(targetEntityType, "RELATION")),
  );
  const [dateFieldId, setDateFieldId] = useState(
    valueFromState(state, "dateFieldId") ||
    (initialValues?.config.type === "WORKFLOW"
      ? initialValues.config.dateFieldId
      : firstActiveFieldId(targetEntityType, "DATE")),
  );
  const [statusFieldId, setStatusFieldId] = useState(
    valueFromState(state, "statusFieldId") ||
    (initialValues?.config.type === "WORKFLOW"
      ? initialValues.config.statusFieldId
      : firstActiveFieldId(targetEntityType, "SELECT")),
  );
  const statusField = targetEntityType?.fields.find((field) => field.id === statusFieldId);
  const [presentOptionId, setPresentOptionId] = useState(
    valueFromState(state, "presentOptionId") ||
    (initialValues?.config.type === "WORKFLOW"
      ? initialValues.config.presentOptionId ?? ""
      : firstActiveOptionId(statusField)),
  );
  const [absentOptionId, setAbsentOptionId] = useState(
    valueFromState(state, "absentOptionId") ||
    (initialValues?.config.type === "WORKFLOW"
      ? initialValues.config.absentOptionId ?? ""
      : secondActiveOptionId(statusField)),
  );
  const [observationFieldId, setObservationFieldId] = useState(
    valueFromState(state, "observationFieldId") ||
    (initialValues?.config.type === "WORKFLOW"
      ? initialValues.config.observationFieldId ?? ""
      : ""),
  );
  const [dashboardEntityTypeIds, setDashboardEntityTypeIds] = useState<Set<string>>(
    new Set(valuesFromState(state, "entityTypeIds") ??
      (initialValues?.config.type === "DASHBOARD"
      ? initialValues.config.entityTypeIds
      : entityTypes[0]?.id ? [entityTypes[0].id] : [])),
  );
  const boardEntityType = entityTypes.find((entityType) => entityType.id === entityTypeId);
  const activeBoardFields = useMemo(
    () => boardEntityType?.fields.filter((field) => field.isActive) ?? [],
    [boardEntityType],
  );
  const initialBoardFieldKey = initialValues?.config.type === "BOARD"
    ? initialValues.config.groupByFieldKey
    : activeBoardFields[0]?.key ?? "";
  const [groupByFieldKey, setGroupByFieldKey] = useState(initialBoardFieldKey);

  function toggleDashboardEntity(entityTypeId: string, checked: boolean) {
    const next = new Set(dashboardEntityTypeIds);

    if (checked) {
      next.add(entityTypeId);
    } else {
      next.delete(entityTypeId);
    }

    setDashboardEntityTypeIds(next);
  }

  return (
    <form action={formAction} className="grid gap-4">
      <ActionErrorSummary state={state} />
      <label className="grid gap-2 text-sm font-medium">
        Nombre
        <input
          className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
          name="name"
          onChange={(event) => {
            const nextName = event.target.value;
            setName(nextName);

            if (!slugTouched) {
              setSlug(suggestedAppViewSlug(nextName));
            }
          }}
          required
          value={name}
        />
        <FieldError errors={state.fieldErrors?.name} />
      </label>

      <label className="grid gap-2 text-sm font-medium">
        Slug
        <input
          className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
          name="slug"
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(suggestedAppViewSlug(event.target.value));
          }}
          required
          value={slug}
        />
        <FieldError errors={state.fieldErrors?.slug} />
      </label>

      <label className="grid gap-2 text-sm font-medium">
        Icono opcional
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none ring-ring focus-visible:ring-2"
          defaultValue={valueFromState(state, "icon", initialValues?.icon ?? "")}
          name="icon"
        >
          <option value="">Sin icono</option>
          {entityIconOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <FieldError errors={state.fieldErrors?.icon} />
      </label>

      <label className="grid gap-2 text-sm font-medium">
        Tipo
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none ring-ring focus-visible:ring-2"
          name="type"
          onChange={(event) => setType(event.target.value as AppViewType)}
          value={type}
        >
          {appViewTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <FieldError errors={state.fieldErrors?.type} />
      </label>

      <ConfigFields
        activeBoardFields={activeBoardFields}
        dashboardEntityTypeIds={dashboardEntityTypeIds}
        entityTypeId={entityTypeId}
        entityTypes={entityTypes}
        fieldErrors={state.fieldErrors}
        groupByFieldKey={groupByFieldKey}
        dateFieldId={dateFieldId}
        setEntityTypeId={setEntityTypeId}
        observationFieldId={observationFieldId}
        personFieldId={personFieldId}
        presentOptionId={presentOptionId}
        absentOptionId={absentOptionId}
        setDateFieldId={setDateFieldId}
        setAbsentOptionId={setAbsentOptionId}
        setGroupByFieldKey={setGroupByFieldKey}
        setObservationFieldId={setObservationFieldId}
        setPersonFieldId={setPersonFieldId}
        setPresentOptionId={setPresentOptionId}
        setSourceEntityTypeId={setSourceEntityTypeId}
        setStatusFieldId={setStatusFieldId}
        setTargetEntityTypeId={setTargetEntityTypeId}
        sourceEntityTypeId={sourceEntityTypeId}
        statusFieldId={statusFieldId}
        targetEntityTypeId={targetEntityTypeId}
        toggleDashboardEntity={toggleDashboardEntity}
        type={type}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Orden
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
            defaultValue={valueFromState(state, "sortOrder", String(initialValues?.sortOrder ?? 0))}
            min={0}
            name="sortOrder"
            type="number"
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm font-medium">
          <input
            className="h-4 w-4"
            defaultChecked={state.values ? valueFromState(state, "active") === "on" : initialValues?.active ?? true}
            name="active"
            type="checkbox"
          />
          Activa
        </label>
      </div>

      <Button disabled={actionPending} type="submit">
        {actionPending ? "Guardando..." : submitLabel}
      </Button>
    </form>
  );
}

function ConfigFields({
  activeBoardFields,
  dashboardEntityTypeIds,
  dateFieldId,
  entityTypeId,
  entityTypes,
  fieldErrors,
  groupByFieldKey,
  observationFieldId,
  personFieldId,
  presentOptionId,
  absentOptionId,
  setDateFieldId,
  setAbsentOptionId,
  setEntityTypeId,
  setGroupByFieldKey,
  setObservationFieldId,
  setPersonFieldId,
  setPresentOptionId,
  setSourceEntityTypeId,
  setStatusFieldId,
  setTargetEntityTypeId,
  sourceEntityTypeId,
  statusFieldId,
  targetEntityTypeId,
  toggleDashboardEntity,
  type,
}: {
  activeBoardFields: AppViewEntityTypeOption["fields"];
  dashboardEntityTypeIds: Set<string>;
  dateFieldId: string;
  entityTypeId: string;
  entityTypes: AppViewEntityTypeOption[];
  fieldErrors?: Record<string, string[]>;
  groupByFieldKey: string;
  observationFieldId: string;
  personFieldId: string;
  presentOptionId: string;
  absentOptionId: string;
  setDateFieldId: (value: string) => void;
  setAbsentOptionId: (value: string) => void;
  setEntityTypeId: (value: string) => void;
  setGroupByFieldKey: (value: string) => void;
  setObservationFieldId: (value: string) => void;
  setPersonFieldId: (value: string) => void;
  setPresentOptionId: (value: string) => void;
  setSourceEntityTypeId: (value: string) => void;
  setStatusFieldId: (value: string) => void;
  setTargetEntityTypeId: (value: string) => void;
  sourceEntityTypeId: string;
  statusFieldId: string;
  targetEntityTypeId: string;
  toggleDashboardEntity: (entityTypeId: string, checked: boolean) => void;
  type: AppViewType;
}) {
  if (type === "WORKFLOW") {
    const targetEntityType = entityTypes.find((entityType) => entityType.id === targetEntityTypeId);
    const activeTargetFields = targetEntityType?.fields.filter((field) => field.isActive) ?? [];
    const statusField = activeTargetFields.find((field) => field.id === statusFieldId);
    const activeStatusOptions = statusField?.options.filter((option) => option.isActive) ?? [];

    return (
      <fieldset className="grid gap-3 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">Configuración del flujo</legend>
        <EntitySelect
          label="Entidad fuente"
          name="sourceEntityTypeId"
          onChange={setSourceEntityTypeId}
          options={entityTypes}
          value={sourceEntityTypeId}
          errors={fieldErrors?.sourceEntityTypeId}
        />
        <EntitySelect
          label="Entidad destino"
          name="targetEntityTypeId"
          onChange={(value) => {
            const nextTarget = entityTypes.find((entityType) => entityType.id === value);

            setTargetEntityTypeId(value);
            setPersonFieldId(firstActiveFieldId(nextTarget, "RELATION"));
            setDateFieldId(firstActiveFieldId(nextTarget, "DATE"));
            const nextStatusFieldId = firstActiveFieldId(nextTarget, "SELECT");
            const nextStatusField = nextTarget?.fields.find((field) => field.id === nextStatusFieldId);
            setStatusFieldId(nextStatusFieldId);
            setPresentOptionId(firstActiveOptionId(nextStatusField));
            setAbsentOptionId(secondActiveOptionId(nextStatusField));
            setObservationFieldId(firstActiveFieldId(nextTarget, "TEXTAREA"));
          }}
          options={entityTypes}
          value={targetEntityTypeId}
          errors={fieldErrors?.targetEntityTypeId}
        />
        <label className="grid gap-2 text-sm font-medium">
          Workflow
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none ring-ring focus-visible:ring-2"
            name="workflowKey"
            defaultValue="attendance"
          >
            {appViewWorkflowOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldSelect
            fields={activeTargetFields}
            label="Campo Persona"
            name="personFieldId"
            onChange={setPersonFieldId}
            preferredType="RELATION"
            value={personFieldId}
            errors={fieldErrors?.personFieldId}
          />
          <FieldSelect
            fields={activeTargetFields}
            label="Campo Fecha"
            name="dateFieldId"
            onChange={setDateFieldId}
            preferredType="DATE"
            value={dateFieldId}
            errors={fieldErrors?.dateFieldId}
          />
          <FieldSelect
            fields={activeTargetFields}
            label="Campo Estado"
            name="statusFieldId"
            onChange={(value) => {
              const nextStatusField = activeTargetFields.find((field) => field.id === value);

              setStatusFieldId(value);
              setPresentOptionId(firstActiveOptionId(nextStatusField));
              setAbsentOptionId(secondActiveOptionId(nextStatusField));
            }}
            preferredType="SELECT"
            value={statusFieldId}
            errors={fieldErrors?.statusFieldId}
          />
          <OptionSelect
            errors={fieldErrors?.presentOptionId}
            label="Opción para Presente"
            name="presentOptionId"
            onChange={setPresentOptionId}
            options={activeStatusOptions}
            value={presentOptionId}
          />
          <OptionSelect
            errors={fieldErrors?.absentOptionId}
            label="Opción para Ausente"
            name="absentOptionId"
            onChange={setAbsentOptionId}
            options={activeStatusOptions}
            value={absentOptionId}
          />
          <FieldSelect
            fields={activeTargetFields}
            includeEmpty
            label="Campo Observación"
            name="observationFieldId"
            onChange={setObservationFieldId}
            preferredType="TEXTAREA"
            value={observationFieldId}
            errors={fieldErrors?.observationFieldId}
          />
        </div>
      </fieldset>
    );
  }

  if (type === "BOARD") {
    return (
      <fieldset className="grid gap-3 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">Configuración del tablero</legend>
        <EntitySelect
          label="Entidad"
          name="entityTypeId"
          onChange={(value) => {
            setEntityTypeId(value);
            const nextEntityType = entityTypes.find((entityType) => entityType.id === value);
            setGroupByFieldKey(nextEntityType?.fields.find((field) => field.isActive)?.key ?? "");
          }}
          options={entityTypes}
          value={entityTypeId}
          errors={fieldErrors?.entityTypeId}
        />
        <label className="grid gap-2 text-sm font-medium">
          Campo de agrupación
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none ring-ring focus-visible:ring-2"
            name="groupByFieldKey"
            onChange={(event) => setGroupByFieldKey(event.target.value)}
            value={groupByFieldKey}
          >
            <option value="">Selecciona un campo</option>
            {activeBoardFields.map((field) => (
              <option key={field.id} value={field.key}>
                {field.name}
              </option>
            ))}
          </select>
          <FieldError errors={fieldErrors?.groupByFieldKey} />
        </label>
      </fieldset>
    );
  }

  if (type === "DASHBOARD") {
    return (
      <fieldset className="grid gap-3 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">Entidades del dashboard</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {entityTypes.map((entityType) => (
            <label className="flex items-center gap-2 text-sm" key={entityType.id}>
              <input
                checked={dashboardEntityTypeIds.has(entityType.id)}
                className="h-4 w-4"
                name="entityTypeIds"
                onChange={(event) => toggleDashboardEntity(entityType.id, event.target.checked)}
                type="checkbox"
                value={entityType.id}
              />
              <EntityIcon className="text-muted-foreground" icon={entityType.icon} />
              {entityType.name}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset className="grid gap-3 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium">Configuración de registros</legend>
      <EntitySelect
        label="Entidad"
        name="entityTypeId"
        onChange={setEntityTypeId}
        options={entityTypes}
        value={entityTypeId}
        errors={fieldErrors?.entityTypeId}
      />
    </fieldset>
  );
}

function FieldSelect({
  errors,
  fields,
  includeEmpty = false,
  label,
  name,
  onChange,
  preferredType,
  value,
}: {
  errors?: string[];
  fields: AppViewEntityTypeOption["fields"];
  includeEmpty?: boolean;
  label: string;
  name: string;
  onChange: (value: string) => void;
  preferredType: string;
  value: string;
}) {
  const preferredFields = fields.filter((field) => field.type === preferredType);
  const otherFields = fields.filter((field) => field.type !== preferredType);

  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <select
        className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none ring-ring focus-visible:ring-2"
        name={name}
        onChange={(event) => onChange(event.target.value)}
        required={!includeEmpty}
        value={value}
      >
        {includeEmpty ? <option value="">Sin campo</option> : <option value="">Selecciona un campo</option>}
        {[...preferredFields, ...otherFields].map((field) => (
          <option key={field.id} value={field.id}>
            {field.name}
          </option>
        ))}
      </select>
      <FieldError errors={errors} />
    </label>
  );
}

function OptionSelect({
  errors,
  label,
  name,
  onChange,
  options,
  value,
}: {
  errors?: string[];
  label: string;
  name: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; label: string; value: string }>;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <select
        className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none ring-ring focus-visible:ring-2"
        name={name}
        onChange={(event) => onChange(event.target.value)}
        required
        value={value}
      >
        <option value="">Selecciona una opción</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError errors={errors} />
    </label>
  );
}

function firstActiveFieldId(
  entityType: AppViewEntityTypeOption | undefined,
  type: string,
) {
  return entityType?.fields.find((field) => field.isActive && field.type === type)?.id ?? "";
}

function firstActiveOptionId(field: AppViewEntityTypeOption["fields"][number] | undefined) {
  return field?.options.find((option) => option.isActive)?.id ?? "";
}

function secondActiveOptionId(field: AppViewEntityTypeOption["fields"][number] | undefined) {
  return field?.options.filter((option) => option.isActive)[1]?.id ?? "";
}

function EntitySelect({
  errors,
  label,
  name,
  onChange,
  options,
  value,
}: {
  errors?: string[];
  label: string;
  name: string;
  onChange: (value: string) => void;
  options: AppViewEntityTypeOption[];
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <select
        className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none ring-ring focus-visible:ring-2"
        name={name}
        onChange={(event) => onChange(event.target.value)}
        required
        value={value}
      >
        <option value="">Selecciona una entidad</option>
        {options.map((entityType) => (
          <option key={entityType.id} value={entityType.id}>
            {entityType.name}
          </option>
        ))}
      </select>
      <FieldError errors={errors} />
    </label>
  );
}

function ActionErrorSummary({ state }: { state: AppViewActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      role="alert"
    >
      {state.message}
    </div>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) {
    return null;
  }

  return <p className="text-xs font-normal text-destructive">{errors[0]}</p>;
}

function valueFromState(state: AppViewActionState, key: string, fallback = "") {
  const value = state.values?.[key];

  return Array.isArray(value) ? value[0] ?? fallback : value ?? fallback;
}

function valuesFromState(state: AppViewActionState, key: string) {
  const value = state.values?.[key];

  if (Array.isArray(value)) {
    return value;
  }

  return value ? [value] : undefined;
}
