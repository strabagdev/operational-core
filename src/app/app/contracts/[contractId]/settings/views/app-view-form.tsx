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
    multiple?: boolean;
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
    (initialValues?.config.type === "RECORDS" || initialValues?.config.type === "REPORT" || initialValues?.config.type === "BOARD"
      ? initialValues.config.entityTypeId
      : entityTypes[0]?.id ?? ""),
  );
  const reportEntityType = entityTypes.find((entityType) => entityType.id === entityTypeId);
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
  const [workflowKey, setWorkflowKey] = useState(
    valueFromState(state, "workflowKey") ||
    (initialValues?.config.type === "WORKFLOW" ? initialValues.config.workflowKey : "attendance"),
  );
  const [personFieldId, setPersonFieldId] = useState(
    valueFromState(state, "personFieldId") ||
    (initialValues?.config.type === "WORKFLOW" && initialValues.config.workflowKey === "attendance"
      ? initialValues.config.personFieldId
      : firstActiveFieldId(targetEntityType, "RELATION")),
  );
  const [subjectFieldId, setSubjectFieldId] = useState(
    valueFromState(state, "subjectFieldId") ||
    (initialValues?.config.type === "WORKFLOW" && initialValues.config.workflowKey === "state-update"
      ? initialValues.config.subjectFieldId
      : firstActiveFieldId(targetEntityType, "RELATION")),
  );
  const [dateFieldId, setDateFieldId] = useState(
    valueFromState(state, "dateFieldId") ||
    ((initialValues?.config.type === "WORKFLOW" || initialValues?.config.type === "REPORT") && "dateFieldId" in initialValues.config
      ? initialValues.config.dateFieldId ?? ""
      : firstActiveFieldId(targetEntityType, "DATE") || firstActiveFieldId(reportEntityType, "DATE")),
  );
  const [statusFieldId, setStatusFieldId] = useState(
    valueFromState(state, "statusFieldId") ||
    (initialValues?.config.type === "WORKFLOW" && initialValues.config.workflowKey === "attendance"
      ? initialValues.config.statusFieldId
      : firstActiveFieldId(targetEntityType, "SELECT")),
  );
  const statusField = targetEntityType?.fields.find((field) => field.id === statusFieldId);
  const [defaultCheckInOptionId, setDefaultCheckInOptionId] = useState(
    valueFromState(state, "defaultCheckInOptionId") ||
    (initialValues?.config.type === "WORKFLOW" && initialValues.config.workflowKey === "attendance"
      ? initialValues.config.defaultCheckInOptionId ?? ""
      : firstActiveOptionId(statusField)),
  );
  const [observationFieldId, setObservationFieldId] = useState(
    valueFromState(state, "observationFieldId") ||
    (initialValues?.config.type === "WORKFLOW" && initialValues.config.workflowKey === "attendance"
      ? initialValues.config.observationFieldId ?? ""
      : ""),
  );
  const [contextFieldIds, setContextFieldIds] = useState<string[]>(
    valuesFromState(state, "contextFieldIds") ??
      (initialValues?.config.type === "WORKFLOW" && initialValues.config.workflowKey === "attendance"
        ? initialValues.config.contextFieldIds ?? []
        : []),
  );
  const [stateFieldIds, setStateFieldIds] = useState<Set<string>>(
    new Set(valuesFromState(state, "stateFieldIds") ??
      (initialValues?.config.type === "WORKFLOW" && initialValues.config.workflowKey === "state-update"
        ? initialValues.config.stateFields.map((field) => field.fieldId)
        : statusFieldId ? [statusFieldId] : [])),
  );
  const [requiredStateFieldIds, setRequiredStateFieldIds] = useState<Set<string>>(
    new Set(valuesFromState(state, "requiredStateFieldIds") ??
      (initialValues?.config.type === "WORKFLOW" && initialValues.config.workflowKey === "state-update"
        ? initialValues.config.stateFields.filter((field) => field.required).map((field) => field.fieldId)
        : statusFieldId ? [statusFieldId] : [])),
  );
  const [extraFieldIds, setExtraFieldIds] = useState<Set<string>>(
    new Set(valuesFromState(state, "extraFieldIds") ??
      (initialValues?.config.type === "WORKFLOW" && initialValues.config.workflowKey === "state-update"
        ? initialValues.config.extraFieldIds
        : [])),
  );
  const [uniquenessMode, setUniquenessMode] = useState(
    valueFromState(state, "uniquenessMode") ||
    (initialValues?.config.type === "WORKFLOW" && initialValues.config.workflowKey === "state-update"
      ? initialValues.config.uniqueness.mode
      : "none"),
  );
  const [historyMode, setHistoryMode] = useState(
    valueFromState(state, "historyMode") ||
    (initialValues?.config.type === "WORKFLOW" && initialValues.config.workflowKey === "state-update"
      ? initialValues.config.historyMode
      : "append"),
  );
  const [dashboardEntityTypeIds, setDashboardEntityTypeIds] = useState<Set<string>>(
    new Set(valuesFromState(state, "entityTypeIds") ??
      (initialValues?.config.type === "DASHBOARD"
      ? initialValues.config.entityTypeIds
      : entityTypes[0]?.id ? [entityTypes[0].id] : [])),
  );
  const [presentationMode, setPresentationMode] = useState(
    valueFromState(state, "presentationMode") ||
    (initialValues?.config.type === "REPORT" ? initialValues.config.presentationMode : "TABLE"),
  );
  const [reportTimeMode, setReportTimeMode] = useState(
    valueFromState(state, "reportTimeMode") ||
    (initialValues?.config.type === "REPORT" ? initialValues.config.timeFilter?.mode ?? "RANGE" : "RANGE"),
  );
  const [reportTimeDefaultPeriod, setReportTimeDefaultPeriod] = useState(
    valueFromState(state, "reportTimeDefaultPeriod") ||
    (initialValues?.config.type === "REPORT" ? initialValues.config.timeFilter?.defaultPeriod ?? "CURRENT_MONTH" : "CURRENT_MONTH"),
  );
  const [reportTimeAllowChange, setReportTimeAllowChange] = useState(
    state.values ? valueFromState(state, "reportTimeAllowChange") === "on" : initialValues?.config.type === "REPORT"
      ? initialValues.config.timeFilter?.allowChange ?? true
      : true,
  );
  const [visibleFieldIds, setVisibleFieldIds] = useState<string[]>(
    valuesFromState(state, "visibleFieldIds") ??
      (initialValues?.config.type === "REPORT" && initialValues.config.presentationMode === "TABLE"
        ? initialValues.config.table.visibleFieldIds
        : []),
  );
  const [defaultSortFieldId, setDefaultSortFieldId] = useState(
    valueFromState(state, "defaultSortFieldId") ||
    (initialValues?.config.type === "REPORT" && initialValues.config.presentationMode === "TABLE"
      ? initialValues.config.table.defaultSortFieldId ?? ""
      : ""),
  );
  const [defaultSortDirection, setDefaultSortDirection] = useState(
    valueFromState(state, "defaultSortDirection") ||
    (initialValues?.config.type === "REPORT" && initialValues.config.presentationMode === "TABLE"
      ? initialValues.config.table.defaultSortDirection
      : "desc"),
  );
  const [reportRowFieldId, setReportRowFieldId] = useState(
    valueFromState(state, "reportRowFieldId") ||
    (initialValues?.config.type === "REPORT" && initialValues.config.presentationMode === "MATRIX"
      ? initialValues.config.matrix.rowFieldId
      : firstActiveFieldId(reportEntityType, "RELATION") || firstActiveFieldId(reportEntityType, "TEXT")),
  );
  const [reportColumnFieldId, setReportColumnFieldId] = useState(
    valueFromState(state, "reportColumnFieldId") ||
    (initialValues?.config.type === "REPORT" && initialValues.config.presentationMode === "MATRIX"
      ? initialValues.config.matrix.columnFieldId
      : firstActiveFieldId(reportEntityType, "DATE")),
  );
  const [reportValueFieldId, setReportValueFieldId] = useState(
    valueFromState(state, "reportValueFieldId") ||
    (initialValues?.config.type === "REPORT" && initialValues.config.presentationMode === "MATRIX"
      ? initialValues.config.matrix.valueFieldId
      : firstActiveFieldId(reportEntityType, "SELECT")),
  );
  const [reportSummaryFieldId, setReportSummaryFieldId] = useState(
    valueFromState(state, "reportSummaryFieldId") ||
    (initialValues?.config.type === "REPORT" && initialValues.config.presentationMode === "MATRIX"
      ? initialValues.config.matrix.summaryFieldId ?? ""
      : ""),
  );
  const reportValueDisplay = initialValues?.config.type === "REPORT"
    ? initialValues.config.valueDisplay
    : {};
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
        contextFieldIds={contextFieldIds}
        dashboardEntityTypeIds={dashboardEntityTypeIds}
        defaultSortDirection={defaultSortDirection}
        defaultSortFieldId={defaultSortFieldId}
        entityTypeId={entityTypeId}
        entityTypes={entityTypes}
        fieldErrors={state.fieldErrors}
        groupByFieldKey={groupByFieldKey}
        dateFieldId={dateFieldId}
        extraFieldIds={extraFieldIds}
        setEntityTypeId={setEntityTypeId}
        observationFieldId={observationFieldId}
        personFieldId={personFieldId}
        presentationMode={presentationMode}
        subjectFieldId={subjectFieldId}
        defaultCheckInOptionId={defaultCheckInOptionId}
        historyMode={historyMode}
        requiredStateFieldIds={requiredStateFieldIds}
        reportTimeAllowChange={reportTimeAllowChange}
        reportTimeDefaultPeriod={reportTimeDefaultPeriod}
        reportTimeMode={reportTimeMode}
        reportColumnFieldId={reportColumnFieldId}
        reportRowFieldId={reportRowFieldId}
        reportSummaryFieldId={reportSummaryFieldId}
        reportValueFieldId={reportValueFieldId}
        reportValueDisplay={reportValueDisplay}
        setDateFieldId={setDateFieldId}
        setContextFieldIds={setContextFieldIds}
        setDefaultSortDirection={setDefaultSortDirection}
        setDefaultSortFieldId={setDefaultSortFieldId}
        setExtraFieldIds={setExtraFieldIds}
        setGroupByFieldKey={setGroupByFieldKey}
        setHistoryMode={setHistoryMode}
        setObservationFieldId={setObservationFieldId}
        setPersonFieldId={setPersonFieldId}
        setPresentationMode={setPresentationMode}
        setRequiredStateFieldIds={setRequiredStateFieldIds}
        setReportTimeAllowChange={setReportTimeAllowChange}
        setReportTimeDefaultPeriod={setReportTimeDefaultPeriod}
        setReportTimeMode={setReportTimeMode}
        setReportColumnFieldId={setReportColumnFieldId}
        setReportRowFieldId={setReportRowFieldId}
        setReportSummaryFieldId={setReportSummaryFieldId}
        setReportValueFieldId={setReportValueFieldId}
        setDefaultCheckInOptionId={setDefaultCheckInOptionId}
        setSourceEntityTypeId={setSourceEntityTypeId}
        setStateFieldIds={setStateFieldIds}
        setStatusFieldId={setStatusFieldId}
        setSubjectFieldId={setSubjectFieldId}
        setTargetEntityTypeId={setTargetEntityTypeId}
        setUniquenessMode={setUniquenessMode}
        setWorkflowKey={setWorkflowKey}
        sourceEntityTypeId={sourceEntityTypeId}
        stateFieldIds={stateFieldIds}
        statusFieldId={statusFieldId}
        targetEntityTypeId={targetEntityTypeId}
        toggleDashboardEntity={toggleDashboardEntity}
        type={type}
        uniquenessMode={uniquenessMode}
        visibleFieldIds={visibleFieldIds}
        setVisibleFieldIds={setVisibleFieldIds}
        workflowKey={workflowKey}
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
  contextFieldIds,
  dashboardEntityTypeIds,
  dateFieldId,
  defaultSortDirection,
  defaultSortFieldId,
  entityTypeId,
  entityTypes,
  extraFieldIds,
  fieldErrors,
  groupByFieldKey,
  historyMode,
  defaultCheckInOptionId,
  observationFieldId,
  personFieldId,
  presentationMode,
  requiredStateFieldIds,
  reportTimeAllowChange,
  reportTimeDefaultPeriod,
  reportTimeMode,
  reportColumnFieldId,
  reportRowFieldId,
  reportSummaryFieldId,
  reportValueFieldId,
  reportValueDisplay,
  setContextFieldIds,
  setDateFieldId,
  setDefaultCheckInOptionId,
  setDefaultSortDirection,
  setDefaultSortFieldId,
  setEntityTypeId,
  setExtraFieldIds,
  setGroupByFieldKey,
  setHistoryMode,
  setObservationFieldId,
  setPersonFieldId,
  setPresentationMode,
  setRequiredStateFieldIds,
  setReportTimeAllowChange,
  setReportTimeDefaultPeriod,
  setReportTimeMode,
  setReportColumnFieldId,
  setReportRowFieldId,
  setReportSummaryFieldId,
  setReportValueFieldId,
  setSourceEntityTypeId,
  setStateFieldIds,
  setStatusFieldId,
  setSubjectFieldId,
  setTargetEntityTypeId,
  setUniquenessMode,
  setWorkflowKey,
  sourceEntityTypeId,
  stateFieldIds,
  statusFieldId,
  subjectFieldId,
  targetEntityTypeId,
  toggleDashboardEntity,
  type,
  uniquenessMode,
  visibleFieldIds,
  setVisibleFieldIds,
  workflowKey,
}: {
  activeBoardFields: AppViewEntityTypeOption["fields"];
  contextFieldIds: string[];
  dashboardEntityTypeIds: Set<string>;
  dateFieldId: string;
  defaultSortDirection: string;
  defaultSortFieldId: string;
  entityTypeId: string;
  entityTypes: AppViewEntityTypeOption[];
  extraFieldIds: Set<string>;
  fieldErrors?: Record<string, string[]>;
  groupByFieldKey: string;
  historyMode: string;
  defaultCheckInOptionId: string;
  observationFieldId: string;
  personFieldId: string;
  presentationMode: string;
  requiredStateFieldIds: Set<string>;
  reportTimeAllowChange: boolean;
  reportTimeDefaultPeriod: string;
  reportTimeMode: string;
  reportColumnFieldId: string;
  reportRowFieldId: string;
  reportSummaryFieldId: string;
  reportValueFieldId: string;
  reportValueDisplay: Record<string, "LABEL" | "INTERNAL_VALUE">;
  setContextFieldIds: (value: string[]) => void;
  setDateFieldId: (value: string) => void;
  setDefaultCheckInOptionId: (value: string) => void;
  setDefaultSortDirection: (value: string) => void;
  setDefaultSortFieldId: (value: string) => void;
  setEntityTypeId: (value: string) => void;
  setExtraFieldIds: (value: Set<string>) => void;
  setGroupByFieldKey: (value: string) => void;
  setHistoryMode: (value: string) => void;
  setObservationFieldId: (value: string) => void;
  setPersonFieldId: (value: string) => void;
  setPresentationMode: (value: string) => void;
  setRequiredStateFieldIds: (value: Set<string>) => void;
  setReportTimeAllowChange: (value: boolean) => void;
  setReportTimeDefaultPeriod: (value: string) => void;
  setReportTimeMode: (value: string) => void;
  setReportColumnFieldId: (value: string) => void;
  setReportRowFieldId: (value: string) => void;
  setReportSummaryFieldId: (value: string) => void;
  setReportValueFieldId: (value: string) => void;
  setSourceEntityTypeId: (value: string) => void;
  setStateFieldIds: (value: Set<string>) => void;
  setStatusFieldId: (value: string) => void;
  setSubjectFieldId: (value: string) => void;
  setTargetEntityTypeId: (value: string) => void;
  setUniquenessMode: (value: string) => void;
  setWorkflowKey: (value: string) => void;
  sourceEntityTypeId: string;
  stateFieldIds: Set<string>;
  statusFieldId: string;
  subjectFieldId: string;
  targetEntityTypeId: string;
  toggleDashboardEntity: (entityTypeId: string, checked: boolean) => void;
  type: AppViewType;
  uniquenessMode: string;
  visibleFieldIds: string[];
  setVisibleFieldIds: (value: string[]) => void;
  workflowKey: string;
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
            setSubjectFieldId(firstActiveFieldId(nextTarget, "RELATION"));
            setDateFieldId(firstActiveFieldId(nextTarget, "DATE"));
            const nextStatusFieldId = firstActiveFieldId(nextTarget, "SELECT");
            const nextStatusField = nextTarget?.fields.find((field) => field.id === nextStatusFieldId);
            setStatusFieldId(nextStatusFieldId);
            setDefaultCheckInOptionId(firstActiveOptionId(nextStatusField));
            setObservationFieldId(firstActiveFieldId(nextTarget, "TEXTAREA"));
            setContextFieldIds([]);
            setStateFieldIds(nextStatusFieldId ? new Set([nextStatusFieldId]) : new Set());
            setRequiredStateFieldIds(nextStatusFieldId ? new Set([nextStatusFieldId]) : new Set());
            setExtraFieldIds(new Set());
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
            onChange={(event) => setWorkflowKey(event.target.value)}
            value={workflowKey}
          >
            {appViewWorkflowOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {workflowKey === "state-update" ? (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldSelect
                fields={activeTargetFields}
                label="Campo Sujeto"
                name="subjectFieldId"
                onChange={setSubjectFieldId}
                preferredType="RELATION"
                value={subjectFieldId}
                errors={fieldErrors?.subjectFieldId}
              />
              <FieldSelect
                fields={activeTargetFields}
                includeEmpty
                label="Campo Fecha"
                name="dateFieldId"
                onChange={setDateFieldId}
                preferredType="DATE"
                value={dateFieldId}
                errors={fieldErrors?.dateFieldId}
              />
              <SelectControl
                label="Unicidad"
                name="uniquenessMode"
                onChange={setUniquenessMode}
                options={[
                  { label: "Sin unicidad", value: "none" },
                  { label: "Sujeto", value: "subject" },
                  { label: "Sujeto + fecha", value: "subject-date" },
                ]}
                value={uniquenessMode}
              />
              <SelectControl
                label="Historial"
                name="historyMode"
                onChange={setHistoryMode}
                options={[
                  { label: "Agregar evento", value: "append" },
                  { label: "Actualizar actual", value: "update-current" },
                ]}
                value={historyMode}
              />
            </div>
            <FieldChecklist
              fields={activeTargetFields.filter((field) => field.type === "SELECT")}
              label="Campos de estado"
              name="stateFieldIds"
              requiredName="requiredStateFieldIds"
              selected={stateFieldIds}
              requiredSelected={requiredStateFieldIds}
              setRequiredSelected={setRequiredStateFieldIds}
              setSelected={setStateFieldIds}
            />
            {activeTargetFields
              .filter((field) => stateFieldIds.has(field.id))
              .map((field) => (
                <OptionSelect
                  key={field.id}
                  label={`Opción por defecto · ${field.name}`}
                  name={`stateFieldDefaultOptionId:${field.id}`}
                  onChange={() => undefined}
                  options={field.options.filter((option) => option.isActive)}
                  value=""
                  includeEmpty
                />
              ))}
            <FieldChecklist
              fields={activeTargetFields.filter((field) => stateUpdateExtraFieldTypes.has(field.type))}
              label="Campos extra"
              name="extraFieldIds"
              selected={extraFieldIds}
              setSelected={setExtraFieldIds}
            />
            <FieldError errors={fieldErrors?.stateFieldIds ?? fieldErrors?.extraFieldIds} />
          </div>
        ) : (
          <div className="grid gap-3">
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
                  setDefaultCheckInOptionId(firstActiveOptionId(nextStatusField));
                }}
                preferredType="SELECT"
                value={statusFieldId}
                errors={fieldErrors?.statusFieldId}
              />
              <OptionSelect
                errors={fieldErrors?.defaultCheckInOptionId}
                label="Estado por defecto de checking"
                name="defaultCheckInOptionId"
                onChange={setDefaultCheckInOptionId}
                options={activeStatusOptions}
                value={defaultCheckInOptionId}
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
            <OrderedFieldChecklist
              fields={activeTargetFields.filter((field) =>
                field.type === "SELECT" &&
                !field.multiple &&
                !new Set([personFieldId, dateFieldId, statusFieldId, observationFieldId].filter(Boolean)).has(field.id),
              )}
              label="Campos de contexto"
              name="contextFieldIds"
              selected={contextFieldIds}
              setSelected={setContextFieldIds}
            />
            <FieldError errors={fieldErrors?.contextFieldIds} />
          </div>
        )}
      </fieldset>
    );
  }

  if (type === "REPORT") {
    const reportEntityType = entityTypes.find((entityType) => entityType.id === entityTypeId);
    const activeReportFields = reportEntityType?.fields.filter((field) => field.isActive) ?? [];
    const sortableFields = activeReportFields.filter((field) => reportSortableFieldTypes.has(field.type));

    return (
      <fieldset className="grid gap-3 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">Configuración del reporte</legend>
        <EntitySelect
          label="Entidad"
          name="entityTypeId"
          onChange={(value) => {
            const nextEntityType = entityTypes.find((entityType) => entityType.id === value);
            const nextDateFieldId = firstActiveFieldId(nextEntityType, "DATE");

            setEntityTypeId(value);
            setDateFieldId(nextDateFieldId);
            setVisibleFieldIds([]);
            setDefaultSortFieldId(nextDateFieldId);
            setReportRowFieldId(firstActiveFieldId(nextEntityType, "RELATION") || firstActiveFieldId(nextEntityType, "TEXT"));
            setReportColumnFieldId(nextDateFieldId);
            setReportValueFieldId(firstActiveFieldId(nextEntityType, "SELECT"));
            setReportSummaryFieldId("");
          }}
          options={entityTypes}
          value={entityTypeId}
          errors={fieldErrors?.entityTypeId}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldSelect
            fields={activeReportFields}
            label="Campo de fecha"
            name="dateFieldId"
            onChange={setDateFieldId}
            preferredType="DATE"
            value={dateFieldId}
            errors={fieldErrors?.dateFieldId}
          />
          <SelectControl
            label="Presentación"
            name="presentationMode"
            onChange={setPresentationMode}
            options={[
              { label: "Tabla", value: "TABLE" },
              { label: "Matriz", value: "MATRIX" },
            ]}
            value={presentationMode}
          />
        </div>
        <fieldset className="grid gap-3 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">Filtro temporal</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectControl
              label="Modo"
              name="reportTimeMode"
              onChange={setReportTimeMode}
              options={[
                { label: "Rango", value: "RANGE" },
                { label: "Mes", value: "MONTH" },
              ]}
              value={reportTimeMode}
            />
            <SelectControl
              label="Período inicial"
              name="reportTimeDefaultPeriod"
              onChange={setReportTimeDefaultPeriod}
              options={[
                { label: "Mes actual", value: "CURRENT_MONTH" },
              ]}
              value={reportTimeDefaultPeriod}
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              checked={reportTimeAllowChange}
              className="h-4 w-4"
              name="reportTimeAllowChange"
              onChange={(event) => setReportTimeAllowChange(event.target.checked)}
              type="checkbox"
            />
            Permitir cambiar período
          </label>
        </fieldset>
        {presentationMode === "MATRIX" ? (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldSelect
                fields={activeReportFields}
                label="Filas"
                name="reportRowFieldId"
                onChange={setReportRowFieldId}
                preferredType="RELATION"
                value={reportRowFieldId}
                errors={fieldErrors?.reportRowFieldId}
              />
              <FieldSelect
                fields={activeReportFields}
                label="Columnas"
                name="reportColumnFieldId"
                onChange={setReportColumnFieldId}
                preferredType="DATE"
                value={reportColumnFieldId}
                errors={fieldErrors?.reportColumnFieldId}
              />
              <FieldSelect
                fields={activeReportFields}
                label="Valor"
                name="reportValueFieldId"
                onChange={setReportValueFieldId}
                preferredType="SELECT"
                value={reportValueFieldId}
                errors={fieldErrors?.reportValueFieldId}
              />
              <FieldSelect
                fields={activeReportFields}
                includeEmpty
                label="Resumen lateral"
                name="reportSummaryFieldId"
                onChange={setReportSummaryFieldId}
                preferredType="SELECT"
                value={reportSummaryFieldId}
                errors={fieldErrors?.reportSummaryFieldId}
              />
            </div>
            <ReportValueDisplayFields
              fields={reportSelectDisplayFields(activeReportFields, [reportValueFieldId, reportSummaryFieldId])}
              valueDisplay={reportValueDisplay}
            />
          </div>
        ) : (
          <div className="grid gap-3">
            <OrderedFieldChecklist
              fields={activeReportFields}
              label="Columnas visibles"
              name="visibleFieldIds"
              selected={visibleFieldIds}
              setSelected={setVisibleFieldIds}
            />
            <FieldError errors={fieldErrors?.visibleFieldIds} />
            <ReportValueDisplayFields
              fields={reportSelectDisplayFields(activeReportFields, visibleFieldIds)}
              valueDisplay={reportValueDisplay}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldSelect
                fields={sortableFields}
                includeEmpty
                label="Orden"
                name="defaultSortFieldId"
                onChange={setDefaultSortFieldId}
                preferredType="DATE"
                value={defaultSortFieldId}
                errors={fieldErrors?.defaultSortFieldId}
              />
              <SelectControl
                label="Dirección"
                name="defaultSortDirection"
                onChange={setDefaultSortDirection}
                options={[
                  { label: "Descendente", value: "desc" },
                  { label: "Ascendente", value: "asc" },
                ]}
                value={defaultSortDirection}
              />
            </div>
          </div>
        )}
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
  includeEmpty = false,
  label,
  name,
  onChange,
  options,
  value,
}: {
  errors?: string[];
  includeEmpty?: boolean;
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
        required={!includeEmpty}
        value={value}
      >
        <option value="">{includeEmpty ? "Sin opción por defecto" : "Selecciona una opción"}</option>
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

function SelectControl({
  label,
  name,
  onChange,
  options,
  value,
}: {
  label: string;
  name: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <select
        className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none ring-ring focus-visible:ring-2"
        name={name}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FieldChecklist({
  fields,
  label,
  name,
  requiredName,
  requiredSelected,
  selected,
  setRequiredSelected,
  setSelected,
}: {
  fields: AppViewEntityTypeOption["fields"];
  label: string;
  name: string;
  requiredName?: string;
  requiredSelected?: Set<string>;
  selected: Set<string>;
  setRequiredSelected?: (value: Set<string>) => void;
  setSelected: (value: Set<string>) => void;
}) {
  return (
    <fieldset className="grid gap-2 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map((field) => (
          <div className="grid gap-1" key={field.id}>
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={selected.has(field.id)}
                className="h-4 w-4"
                name={name}
                onChange={(event) => {
                  const next = new Set(selected);
                  if (event.target.checked) {
                    next.add(field.id);
                  } else {
                    next.delete(field.id);
                  }
                  setSelected(next);
                }}
                type="checkbox"
                value={field.id}
              />
              {field.name}
            </label>
            {requiredName && selected.has(field.id) ? (
              <label className="ml-6 flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  checked={requiredSelected?.has(field.id) ?? false}
                  className="h-3.5 w-3.5"
                  name={requiredName}
                  onChange={(event) => {
                    if (!setRequiredSelected || !requiredSelected) return;
                    const next = new Set(requiredSelected);
                    if (event.target.checked) {
                      next.add(field.id);
                    } else {
                      next.delete(field.id);
                    }
                    setRequiredSelected(next);
                  }}
                  type="checkbox"
                  value={field.id}
                />
                Obligatorio
              </label>
            ) : null}
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function OrderedFieldChecklist({
  fields,
  label,
  name,
  selected,
  setSelected,
}: {
  fields: AppViewEntityTypeOption["fields"];
  label: string;
  name: string;
  selected: string[];
  setSelected: (value: string[]) => void;
}) {
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  const selectedIds = selected.filter((fieldId, index) =>
    selected.indexOf(fieldId) === index && fieldsById.has(fieldId),
  );
  const selectedSet = new Set(selectedIds);
  const orderedFields = [
    ...selectedIds.map((fieldId) => fieldsById.get(fieldId)!),
    ...fields.filter((field) => !selectedSet.has(field.id)),
  ];

  return (
    <fieldset className="grid gap-2 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      {orderedFields.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay campos SELECT adicionales compatibles.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {orderedFields.map((field) => (
            <label className="flex items-center gap-2 text-sm" key={field.id}>
              <input
                checked={selectedSet.has(field.id)}
                className="h-4 w-4"
                name={name}
                onChange={(event) => {
                  if (event.target.checked) {
                    setSelected([...selectedIds, field.id]);
                  } else {
                    setSelected(selectedIds.filter((fieldId) => fieldId !== field.id));
                  }
                }}
                type="checkbox"
                value={field.id}
              />
              {field.name}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function ReportValueDisplayFields({
  fields,
  valueDisplay,
}: {
  fields: AppViewEntityTypeOption["fields"];
  valueDisplay: Record<string, "LABEL" | "INTERNAL_VALUE">;
}) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <fieldset className="grid gap-2 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium">Presentación de valores SELECT</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <label className="grid gap-2 text-sm font-medium" key={field.id}>
            {field.name} · Mostrar valores como
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none ring-ring focus-visible:ring-2"
              defaultValue={valueDisplay[field.id] ?? "LABEL"}
              name={`reportValueDisplay:${field.id}`}
            >
              <option value="LABEL">Etiqueta visible</option>
              <option value="INTERNAL_VALUE">Valor interno</option>
            </select>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function reportSelectDisplayFields(
  fields: AppViewEntityTypeOption["fields"],
  fieldIds: string[],
) {
  const selected = new Set(fieldIds.filter(Boolean));

  return fields.filter((field) =>
    selected.has(field.id) &&
    (field.type === "SELECT" || field.type === "MULTISELECT"),
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

const stateUpdateExtraFieldTypes = new Set([
  "TEXT",
  "TEXTAREA",
  "INTEGER",
  "DECIMAL",
  "MONEY",
  "BOOLEAN",
  "DATE",
  "TIME",
  "DATETIME",
  "SELECT",
  "RELATION",
]);

const reportSortableFieldTypes = new Set([
  "TEXT",
  "TEXTAREA",
  "EMAIL",
  "PHONE",
  "URL",
  "INTEGER",
  "DECIMAL",
  "MONEY",
  "DATE",
  "DATETIME",
  "TIME",
  "BOOLEAN",
  "SELECT",
]);

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
