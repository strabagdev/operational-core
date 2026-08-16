"use client";

import { useMemo, useState } from "react";
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

type AppViewEntityTypeOption = {
  fields: Array<{
    id: string;
    isActive: boolean;
    key: string;
    name: string;
  }>;
  icon?: string | null;
  id: string;
  name: string;
};

type AppViewFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  entityTypes: AppViewEntityTypeOption[];
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
  initialValues,
  submitLabel,
}: AppViewFormProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [slug, setSlug] = useState(initialValues?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(initialValues?.slug));
  const [type, setType] = useState<AppViewType>(initialValues?.type ?? "RECORDS");
  const [entityTypeId, setEntityTypeId] = useState(
    initialValues?.config.type === "RECORDS" || initialValues?.config.type === "BOARD"
      ? initialValues.config.entityTypeId
      : entityTypes[0]?.id ?? "",
  );
  const [sourceEntityTypeId, setSourceEntityTypeId] = useState(
    initialValues?.config.type === "WORKFLOW"
      ? initialValues.config.sourceEntityTypeId
      : entityTypes[0]?.id ?? "",
  );
  const [targetEntityTypeId, setTargetEntityTypeId] = useState(
    initialValues?.config.type === "WORKFLOW"
      ? initialValues.config.targetEntityTypeId
      : entityTypes[0]?.id ?? "",
  );
  const [dashboardEntityTypeIds, setDashboardEntityTypeIds] = useState<Set<string>>(
    new Set(initialValues?.config.type === "DASHBOARD"
      ? initialValues.config.entityTypeIds
      : entityTypes[0]?.id ? [entityTypes[0].id] : []),
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
    <form action={action} className="grid gap-4">
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
      </label>

      <label className="grid gap-2 text-sm font-medium">
        Icono opcional
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none ring-ring focus-visible:ring-2"
          defaultValue={initialValues?.icon ?? ""}
          name="icon"
        >
          <option value="">Sin icono</option>
          {entityIconOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
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
      </label>

      <ConfigFields
        activeBoardFields={activeBoardFields}
        dashboardEntityTypeIds={dashboardEntityTypeIds}
        entityTypeId={entityTypeId}
        entityTypes={entityTypes}
        groupByFieldKey={groupByFieldKey}
        setEntityTypeId={setEntityTypeId}
        setGroupByFieldKey={setGroupByFieldKey}
        setSourceEntityTypeId={setSourceEntityTypeId}
        setTargetEntityTypeId={setTargetEntityTypeId}
        sourceEntityTypeId={sourceEntityTypeId}
        targetEntityTypeId={targetEntityTypeId}
        toggleDashboardEntity={toggleDashboardEntity}
        type={type}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Orden
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
            defaultValue={initialValues?.sortOrder ?? 0}
            min={0}
            name="sortOrder"
            type="number"
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm font-medium">
          <input
            className="h-4 w-4"
            defaultChecked={initialValues?.active ?? true}
            name="active"
            type="checkbox"
          />
          Activa
        </label>
      </div>

      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}

function ConfigFields({
  activeBoardFields,
  dashboardEntityTypeIds,
  entityTypeId,
  entityTypes,
  groupByFieldKey,
  setEntityTypeId,
  setGroupByFieldKey,
  setSourceEntityTypeId,
  setTargetEntityTypeId,
  sourceEntityTypeId,
  targetEntityTypeId,
  toggleDashboardEntity,
  type,
}: {
  activeBoardFields: AppViewEntityTypeOption["fields"];
  dashboardEntityTypeIds: Set<string>;
  entityTypeId: string;
  entityTypes: AppViewEntityTypeOption[];
  groupByFieldKey: string;
  setEntityTypeId: (value: string) => void;
  setGroupByFieldKey: (value: string) => void;
  setSourceEntityTypeId: (value: string) => void;
  setTargetEntityTypeId: (value: string) => void;
  sourceEntityTypeId: string;
  targetEntityTypeId: string;
  toggleDashboardEntity: (entityTypeId: string, checked: boolean) => void;
  type: AppViewType;
}) {
  if (type === "WORKFLOW") {
    return (
      <fieldset className="grid gap-3 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">Configuración del flujo</legend>
        <EntitySelect
          label="Entidad fuente"
          name="sourceEntityTypeId"
          onChange={setSourceEntityTypeId}
          options={entityTypes}
          value={sourceEntityTypeId}
        />
        <EntitySelect
          label="Entidad destino"
          name="targetEntityTypeId"
          onChange={setTargetEntityTypeId}
          options={entityTypes}
          value={targetEntityTypeId}
        />
        <label className="grid gap-2 text-sm font-medium">
          Workflow
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none ring-ring focus-visible:ring-2"
            name="workflow"
            defaultValue="attendance"
          >
            {appViewWorkflowOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
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
      />
    </fieldset>
  );
}

function EntitySelect({
  label,
  name,
  onChange,
  options,
  value,
}: {
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
    </label>
  );
}
