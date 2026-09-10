"use client";

import { useActionState, useMemo, useState } from "react";
import type { AppViewType } from "@prisma/client";

import { EntityIcon } from "@/components/entity-icon";
import { Button } from "@/components/ui/button";
import {
  appViewTypeOptions,
  appViewWorkflowOptions,
  type AppViewConfig,
  type DatasetDefinition,
  type FilterExpr,
  type PanelConfig,
  type PanelFilter,
  type PanelModule,
  type ReportSelectValueDisplay,
  suggestedAppViewSlug,
} from "@/lib/app-views";
import { entityIconOptions } from "@/lib/entity-icons";

import type { AppViewActionState } from "./actions";

type AppViewEntityTypeOption = {
  fields: Array<{
    config?: unknown;
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

type AppViewOption = {
  active: boolean;
  config: AppViewConfig;
  id: string;
  name: string;
  type: AppViewType;
};

type ReportVirtualFieldOption = {
  id: string;
  name: string;
  type: string;
};

type PanelEditorDataset = DatasetDefinition;
type PanelEditorFilter = PanelFilter & {
  fieldId?: string;
  operator?: "EQ" | "IN";
};
type PanelEditorModule = PanelModule;

type AppViewFormProps = {
  action: (
    state: AppViewActionState,
    formData: FormData,
  ) => Promise<AppViewActionState>;
  appViews?: AppViewOption[];
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

const stateUpdateStateFieldTypes = new Set(["SELECT", "TEXT", "INTEGER", "DECIMAL", "MONEY", "BOOLEAN", "DATE"]);

export function AppViewForm({
  action,
  appViews = [],
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
    (initialValues?.config.type === "RECORDS" || initialValues?.config.type === "BOARD" ||
      (initialValues?.config.type === "REPORT" && initialValues.config.sourceMode !== "STATE_UPDATE")
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
    ((initialValues?.config.type === "WORKFLOW" ||
      (initialValues?.config.type === "REPORT" && initialValues.config.sourceMode !== "STATE_UPDATE")) &&
      "dateFieldId" in initialValues.config
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
  const stateFieldDefaultOptionIds = Object.fromEntries(
    Array.from(stateFieldIds).map((fieldId) => [
      fieldId,
      valueFromState(state, `stateFieldDefaultOptionId:${fieldId}`) ||
        (initialValues?.config.type === "WORKFLOW" && initialValues.config.workflowKey === "state-update"
          ? initialValues.config.stateFields.find((field) => field.fieldId === fieldId)?.defaultOptionId ?? ""
          : ""),
    ]),
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
  const stateUpdateReportOptions = appViews.filter((appView) =>
    appView.active &&
    appView.type === "WORKFLOW" &&
    appView.config.type === "WORKFLOW" &&
    appView.config.workflowKey === "state-update",
  );
  const [reportSourceMode, setReportSourceMode] = useState(
    valueFromState(state, "reportSourceMode") ||
    (initialValues?.config.type === "REPORT" && initialValues.config.sourceMode === "STATE_UPDATE"
      ? "STATE_UPDATE"
      : "ENTITY"),
  );
  const [stateUpdateAppViewId, setStateUpdateAppViewId] = useState(
    valueFromState(state, "stateUpdateAppViewId") ||
    (initialValues?.config.type === "REPORT" && initialValues.config.sourceMode === "STATE_UPDATE"
      ? initialValues.config.stateUpdateAppViewId
      : stateUpdateReportOptions[0]?.id ?? ""),
  );
  const selectedStateUpdateReportView = stateUpdateReportOptions.find((appView) => appView.id === stateUpdateAppViewId);
  const stateUpdateReportFields = selectedStateUpdateReportView?.config.type === "WORKFLOW"
    ? stateUpdateCurrentReportFields(selectedStateUpdateReportView.config, entityTypes)
    : [];
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
        : reportSourceMode === "STATE_UPDATE"
          ? stateUpdateReportFields.map((field) => field.id).filter((fieldId) => fieldId !== "current.updatedAt")
          : []),
  );
  const [defaultSortFieldId, setDefaultSortFieldId] = useState(
    valueFromState(state, "defaultSortFieldId") ||
    (initialValues?.config.type === "REPORT" && initialValues.config.presentationMode === "TABLE"
      ? initialValues.config.table.defaultSortFieldId ?? ""
      : reportSourceMode === "STATE_UPDATE" ? "subject.displayName" : ""),
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
  const initialCurrentStatus = initialValues?.config.type === "REPORT" &&
    initialValues.config.presentationMode === "CURRENT_STATUS"
    ? initialValues.config.currentStatus
    : undefined;
  const initialLatestByRelation = initialValues?.config.type === "REPORT" &&
    initialValues.config.presentationMode === "LATEST_BY_RELATION"
    ? initialValues.config.latestByRelation
    : undefined;
  const initialRelatedEntityTypeId = valueFromState(state, "latestByRelationRelatedEntityTypeId") ||
    initialLatestByRelation?.relatedEntityTypeId ||
    relatedEntityTypeIdFromRelation(reportEntityType, initialCurrentStatus?.relationFieldId ?? initialCurrentStatus?.subjectFieldId) ||
    relationTargetEntityTypeIds(reportEntityType)[0] ||
    entityTypes[0]?.id ||
    "";
  const initialCompatibleRelationFields = relationFieldsTargeting(reportEntityType, initialRelatedEntityTypeId);
  const [currentStatusSubjectFieldId, setCurrentStatusSubjectFieldId] = useState(
    valueFromState(state, "latestByRelationRelationFieldId") ||
    valueFromState(state, "currentStatusRelationFieldId") ||
    valueFromState(state, "currentStatusSubjectFieldId") ||
    initialLatestByRelation?.relationFieldId ||
    initialCurrentStatus?.relationFieldId ||
    initialCurrentStatus?.subjectFieldId ||
    (initialCompatibleRelationFields.length === 1 ? initialCompatibleRelationFields[0].id : ""),
  );
  const [currentStatusStateFieldId, setCurrentStatusStateFieldId] = useState(
    valueFromState(state, "latestByRelationRequiredValueFieldId") ||
    valueFromState(state, "currentStatusRequiredValueFieldId") ||
    valueFromState(state, "currentStatusStateFieldId") ||
    initialLatestByRelation?.requiredValueFieldId ||
    initialCurrentStatus?.requiredValueFieldId ||
    initialCurrentStatus?.stateFieldId ||
    "",
  );
  const [currentStatusDateFieldId, setCurrentStatusDateFieldId] = useState(
    valueFromState(state, "latestByRelationOrderFieldId") ||
    valueFromState(state, "currentStatusOrderFieldId") ||
    valueFromState(state, "currentStatusDateFieldId") ||
    initialLatestByRelation?.orderFieldId ||
    initialCurrentStatus?.orderFieldId ||
    initialCurrentStatus?.dateFieldId ||
    "",
  );
  const [latestByRelationRelatedEntityTypeId, setLatestByRelationRelatedEntityTypeId] = useState(initialRelatedEntityTypeId);
  const [displayFieldIds, setDisplayFieldIds] = useState<string[]>(
    valuesFromState(state, "displayFieldIds") ??
      (initialLatestByRelation?.displayFieldIds?.length
        ? initialLatestByRelation.displayFieldIds
        : initialCurrentStatus?.displayFieldIds?.length
        ? initialCurrentStatus.displayFieldIds
        : [
            initialLatestByRelation?.relationFieldId ??
            initialCurrentStatus?.relationFieldId ?? initialCurrentStatus?.subjectFieldId ?? firstActiveFieldId(reportEntityType, "RELATION"),
            initialLatestByRelation?.requiredValueFieldId ??
            initialCurrentStatus?.requiredValueFieldId ?? initialCurrentStatus?.stateFieldId,
            initialLatestByRelation?.orderFieldId ??
            initialCurrentStatus?.orderFieldId ?? initialCurrentStatus?.dateFieldId,
          ].filter((fieldId): fieldId is string => Boolean(fieldId))),
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
  const initialPanelConfig = panelConfigFromState(state) ??
    (initialValues?.config.type === "PANEL" ? initialValues.config : undefined);
  const [panelDatasets, setPanelDatasets] = useState<PanelEditorDataset[]>(
    initialPanelConfig?.datasets ?? [],
  );
  const [panelFilters, setPanelFilters] = useState<PanelEditorFilter[]>(
    panelEditorFilters(initialPanelConfig),
  );
  const [panelModules, setPanelModules] = useState<PanelEditorModule[]>(
    initialPanelConfig?.modules ?? [],
  );
  const [panelLayoutColumns, setPanelLayoutColumns] = useState(
    initialPanelConfig?.layout.columns ?? 12,
  );
  const [panelLayoutRowHeight, setPanelLayoutRowHeight] = useState(
    initialPanelConfig?.layout.rowHeight ?? 8,
  );
  const panelConfig = buildPanelConfig({
    baseConfig: initialPanelConfig,
    datasets: panelDatasets,
    filters: panelFilters,
    modules: panelModules,
    columns: panelLayoutColumns,
    rowHeight: panelLayoutRowHeight,
  });
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

      {type === "PANEL" ? (
        <PanelConfigFields
          config={panelConfig}
          datasets={panelDatasets}
          entityTypes={entityTypes}
          fieldErrors={state.fieldErrors}
          filters={panelFilters}
          layoutColumns={panelLayoutColumns}
          layoutRowHeight={panelLayoutRowHeight}
          modules={panelModules}
          setDatasets={setPanelDatasets}
          setFilters={setPanelFilters}
          setLayoutColumns={setPanelLayoutColumns}
          setLayoutRowHeight={setPanelLayoutRowHeight}
          setModules={setPanelModules}
        />
      ) : (
        <ConfigFields
          activeBoardFields={activeBoardFields}
          contextFieldIds={contextFieldIds}
          currentStatusDateFieldId={currentStatusDateFieldId}
          currentStatusStateFieldId={currentStatusStateFieldId}
          currentStatusSubjectFieldId={currentStatusSubjectFieldId}
          dashboardEntityTypeIds={dashboardEntityTypeIds}
          defaultSortDirection={defaultSortDirection}
          defaultSortFieldId={defaultSortFieldId}
          displayFieldIds={displayFieldIds}
          entityTypeId={entityTypeId}
          entityTypes={entityTypes}
          fieldErrors={state.fieldErrors}
          groupByFieldKey={groupByFieldKey}
          dateFieldId={dateFieldId}
          extraFieldIds={extraFieldIds}
          appViews={appViews}
          latestByRelationRelatedEntityTypeId={latestByRelationRelatedEntityTypeId}
          setEntityTypeId={setEntityTypeId}
          setLatestByRelationRelatedEntityTypeId={setLatestByRelationRelatedEntityTypeId}
          observationFieldId={observationFieldId}
          personFieldId={personFieldId}
          presentationMode={presentationMode}
          subjectFieldId={subjectFieldId}
          defaultCheckInOptionId={defaultCheckInOptionId}
          historyMode={historyMode}
          requiredStateFieldIds={requiredStateFieldIds}
          stateFieldDefaultOptionIds={stateFieldDefaultOptionIds}
          reportTimeAllowChange={reportTimeAllowChange}
          reportTimeDefaultPeriod={reportTimeDefaultPeriod}
          reportTimeMode={reportTimeMode}
          reportColumnFieldId={reportColumnFieldId}
          reportRowFieldId={reportRowFieldId}
          reportSourceMode={reportSourceMode}
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
          setReportSourceMode={setReportSourceMode}
          setReportSummaryFieldId={setReportSummaryFieldId}
          setReportValueFieldId={setReportValueFieldId}
          setCurrentStatusDateFieldId={setCurrentStatusDateFieldId}
          setCurrentStatusStateFieldId={setCurrentStatusStateFieldId}
          setCurrentStatusSubjectFieldId={setCurrentStatusSubjectFieldId}
          setDefaultCheckInOptionId={setDefaultCheckInOptionId}
          setDisplayFieldIds={setDisplayFieldIds}
          setSourceEntityTypeId={setSourceEntityTypeId}
          setStateFieldIds={setStateFieldIds}
          setStatusFieldId={setStatusFieldId}
          setStateUpdateAppViewId={setStateUpdateAppViewId}
          setSubjectFieldId={setSubjectFieldId}
          setTargetEntityTypeId={setTargetEntityTypeId}
          setUniquenessMode={setUniquenessMode}
          setWorkflowKey={setWorkflowKey}
          sourceEntityTypeId={sourceEntityTypeId}
          stateFieldIds={stateFieldIds}
          stateUpdateAppViewId={stateUpdateAppViewId}
          statusFieldId={statusFieldId}
          targetEntityTypeId={targetEntityTypeId}
          toggleDashboardEntity={toggleDashboardEntity}
          type={type}
          uniquenessMode={uniquenessMode}
          visibleFieldIds={visibleFieldIds}
          setVisibleFieldIds={setVisibleFieldIds}
          workflowKey={workflowKey}
        />
      )}

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

function PanelConfigFields({
  config,
  datasets,
  entityTypes,
  fieldErrors,
  filters,
  layoutColumns,
  layoutRowHeight,
  modules,
  setDatasets,
  setFilters,
  setLayoutColumns,
  setLayoutRowHeight,
  setModules,
}: {
  config: PanelConfig;
  datasets: PanelEditorDataset[];
  entityTypes: AppViewEntityTypeOption[];
  fieldErrors?: Record<string, string[]>;
  filters: PanelEditorFilter[];
  layoutColumns: number;
  layoutRowHeight: number;
  modules: PanelEditorModule[];
  setDatasets: (value: PanelEditorDataset[]) => void;
  setFilters: (value: PanelEditorFilter[]) => void;
  setLayoutColumns: (value: number) => void;
  setLayoutRowHeight: (value: number) => void;
  setModules: (value: PanelEditorModule[]) => void;
}) {
  const addDataset = () => {
    const entityType = entityTypes[0];
    const fieldId = entityType?.fields.find((field) => field.isActive)?.id ?? "";
    const id = nextPanelId("dataset", datasets.map((dataset) => dataset.id));

    setDatasets([
      ...datasets,
      {
        id,
        name: "Dataset",
        source: { type: "ENTITY", entityTypeId: entityType?.id ?? "" },
        transformation: {
          type: "RECORDS",
          fieldIds: fieldId ? [fieldId] : [],
          pagination: { pageSize: 25 },
        },
      },
    ]);
  };
  const addFilter = () => {
    const dataset = datasets[0];
    const entityType = entityTypes.find((item) => item.id === dataset?.source.entityTypeId) ?? entityTypes[0];
    const field = entityType?.fields.find((item) => item.isActive);
    const id = nextPanelId("filter", filters.map((filter) => filter.id));

    setFilters([
      ...filters,
      {
        id,
        label: "Filtro",
        valueType: panelValueTypeForField(field),
        fieldId: field?.id ?? "",
        operator: "EQ",
      },
    ]);
  };
  const addModule = () => {
    const dataset = datasets[0];
    const id = nextPanelId("table", modules.map((module) => module.id));

    setModules([
      ...modules,
      {
        id,
        title: "Tabla",
        datasetId: dataset?.id ?? "",
        visualization: {
          type: "TABLE",
          config: {
            columns: [],
            searchable: true,
            paginated: true,
          },
        },
        layout: { x: 0, y: modules.length, w: Math.min(12, layoutColumns), h: 6 },
      },
    ]);
  };

  return (
    <fieldset className="grid gap-4 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium">Configuración del panel</legend>
      <input name="panelConfig" type="hidden" value={JSON.stringify(panelConfigFormValue(config))} />
      <FieldError errors={fieldErrors?.panelConfig ?? fieldErrors?.datasets ?? fieldErrors?.modules ?? fieldErrors?.filters} />

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">Fuentes de datos</h3>
          <button className="rounded border border-input px-3 py-1 text-sm" onClick={addDataset} type="button">
            Agregar dataset
          </button>
        </div>
        {datasets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay datasets configurados.</p>
        ) : (
          <div className="grid gap-3">
            {datasets.map((dataset, index) => (
              <PanelDatasetEditor
                dataset={dataset}
                datasets={datasets}
                entityTypes={entityTypes}
                index={index}
                key={dataset.id}
                setDatasets={setDatasets}
              />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">Filtros</h3>
          <button className="rounded border border-input px-3 py-1 text-sm" disabled={datasets.length === 0} onClick={addFilter} type="button">
            Agregar filtro
          </button>
        </div>
        {filters.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin filtros de panel.</p>
        ) : (
          <div className="grid gap-3">
            {filters.map((filter, index) => (
              <PanelFilterEditor
                datasets={datasets}
                entityTypes={entityTypes}
                filter={filter}
                filters={filters}
                index={index}
                key={filter.id}
                setFilters={setFilters}
              />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">Módulos</h3>
          <button className="rounded border border-input px-3 py-1 text-sm" disabled={datasets.length === 0} onClick={addModule} type="button">
            Agregar tabla
          </button>
        </div>
        <div className="grid gap-2 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          <span>KPI, gráficos, tablero, Gantt y texto: próximamente</span>
        </div>
        {modules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay módulos configurados.</p>
        ) : (
          <div className="grid gap-3">
            {modules.map((module, index) => (
              <PanelModuleEditor
                datasets={datasets}
                entityTypes={entityTypes}
                index={index}
                key={module.id}
                layoutColumns={layoutColumns}
                module={module}
                modules={modules}
                setModules={setModules}
              />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <h3 className="text-sm font-medium">Diseño</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberControl
            label="Columnas de grilla"
            max={24}
            min={1}
            onChange={setLayoutColumns}
            value={layoutColumns}
          />
          <NumberControl
            label="Alto de fila"
            max={64}
            min={1}
            onChange={setLayoutRowHeight}
            value={layoutRowHeight}
          />
        </div>
        <div className="grid gap-2 rounded-md border border-border p-3">
          <p className="text-sm font-medium">Vista previa</p>
          <div className="grid gap-2">
            {modules.map((module, index) => (
              <div className="rounded border border-border px-3 py-2 text-sm" key={module.id}>
                {index + 1}. {module.title || module.id} · columnas {module.layout.w} · dataset {module.datasetId || "sin dataset"}
              </div>
            ))}
          </div>
        </div>
      </section>
    </fieldset>
  );
}

function PanelDatasetEditor({
  dataset,
  datasets,
  entityTypes,
  index,
  setDatasets,
}: {
  dataset: PanelEditorDataset;
  datasets: PanelEditorDataset[];
  entityTypes: AppViewEntityTypeOption[];
  index: number;
  setDatasets: (value: PanelEditorDataset[]) => void;
}) {
  const entityType = entityTypes.find((item) => item.id === dataset.source.entityTypeId);
  const activeFields = entityType?.fields.filter((field) => field.isActive) ?? [];
  const updateDataset = (next: PanelEditorDataset) => setDatasets(replaceAt(datasets, index, next));
  const transformation = dataset.transformation;

  return (
    <div className="grid gap-3 rounded-md border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextControl
          label="Nombre visible"
          onChange={(name) => updateDataset({ ...dataset, name })}
          value={dataset.name ?? ""}
        />
        <TextControl
          label="Identificador interno"
          onChange={(id) => updateDataset({ ...dataset, id })}
          value={dataset.id}
        />
        <EntitySelect
          label="Entidad de origen"
          name={`panelDatasetEntity:${dataset.id}`}
          onChange={(entityTypeId) => {
            const nextEntity = entityTypes.find((item) => item.id === entityTypeId);
            const nextFieldIds = transformation.fieldIds.filter((fieldId) =>
              nextEntity?.fields.some((field) => field.id === fieldId && field.isActive),
            );

            updateDataset({
              ...dataset,
              source: { type: "ENTITY", entityTypeId },
              transformation: transformation.type === "LATEST_BY_RELATION"
                ? {
                    ...transformation,
                    relatedEntityTypeId: relationTargetEntityTypeIds(nextEntity)[0] ?? "",
                    relationFieldId: "",
                    orderFieldId: "",
                    requiredValueFieldId: undefined,
                    fieldIds: nextFieldIds,
                  }
                : { ...transformation, fieldIds: nextFieldIds },
            });
          }}
          options={entityTypes}
          value={dataset.source.entityTypeId}
        />
        <SelectControl
          label="Transformación"
          name={`panelDatasetTransformation:${dataset.id}`}
          onChange={(value) => {
            updateDataset({
              ...dataset,
              transformation: value === "LATEST_BY_RELATION"
                ? {
                    type: "LATEST_BY_RELATION",
                    relatedEntityTypeId: relationTargetEntityTypeIds(entityType)[0] ?? "",
                    relationFieldId: "",
                    orderFieldId: "",
                    fieldIds: transformation.fieldIds,
                    pagination: transformation.pagination,
                  }
                : {
                    type: "RECORDS",
                    fieldIds: transformation.fieldIds,
                    pagination: transformation.pagination,
                  },
            });
          }}
          options={[
            { label: "Registros", value: "RECORDS" },
            { label: "Último registro por relación", value: "LATEST_BY_RELATION" },
          ]}
          value={transformation.type}
        />
      </div>
      {transformation.type === "LATEST_BY_RELATION" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <EntitySelect
            label="Entidad relacionada"
            name={`panelDatasetRelatedEntity:${dataset.id}`}
            onChange={(relatedEntityTypeId) => updateDataset({
              ...dataset,
              transformation: {
                ...transformation,
                relatedEntityTypeId,
                relationFieldId: relationFieldsTargeting(entityType, relatedEntityTypeId)[0]?.id ?? "",
              },
            })}
            options={entityTypes}
            value={transformation.relatedEntityTypeId}
          />
          <FieldSelect
            allowedTypes={["RELATION"]}
            fields={relationFieldsTargeting(entityType, transformation.relatedEntityTypeId)}
            label="Campo relacionado"
            name={`panelDatasetRelation:${dataset.id}`}
            onChange={(relationFieldId) => updateDataset({ ...dataset, transformation: { ...transformation, relationFieldId } })}
            preferredType="RELATION"
            value={transformation.relationFieldId}
          />
          <FieldSelect
            fields={activeFields.filter((field) => reportSortableFieldTypes.has(field.type))}
            label="Ordenar por"
            name={`panelDatasetOrder:${dataset.id}`}
            onChange={(orderFieldId) => updateDataset({ ...dataset, transformation: { ...transformation, orderFieldId } })}
            preferredType="DATE"
            value={transformation.orderFieldId}
          />
          <FieldSelect
            fields={activeFields}
            includeEmpty
            label="Campo con valor obligatorio"
            name={`panelDatasetRequired:${dataset.id}`}
            onChange={(requiredValueFieldId) => updateDataset({
              ...dataset,
              transformation: { ...transformation, requiredValueFieldId: requiredValueFieldId || undefined },
            })}
            preferredType="SELECT"
            value={transformation.requiredValueFieldId ?? ""}
          />
        </div>
      ) : null}
      <OrderedFieldChecklist
        fields={activeFields}
        label={transformation.type === "RECORDS" ? "Campos seleccionados" : "Campos requeridos para la salida"}
        name={`panelDatasetFields:${dataset.id}`}
        selected={transformation.fieldIds}
        setSelected={(fieldIds) => updateDataset({ ...dataset, transformation: { ...transformation, fieldIds } })}
      />
      <div className="flex justify-end">
        <button className="rounded border border-input px-3 py-1 text-sm" onClick={() => setDatasets(datasets.filter((_, itemIndex) => itemIndex !== index))} type="button">
          Eliminar
        </button>
      </div>
    </div>
  );
}

function PanelFilterEditor({
  datasets,
  entityTypes,
  filter,
  filters,
  index,
  setFilters,
}: {
  datasets: PanelEditorDataset[];
  entityTypes: AppViewEntityTypeOption[];
  filter: PanelEditorFilter;
  filters: PanelEditorFilter[];
  index: number;
  setFilters: (value: PanelEditorFilter[]) => void;
}) {
  const dataset = datasets[0];
  const entityType = entityTypes.find((item) => item.id === dataset?.source.entityTypeId);
  const compatibleFields = entityType?.fields.filter((field) => field.isActive) ?? [];
  const selectedField = compatibleFields.find((field) => field.id === filter.fieldId);
  const operators = panelOperatorsForField(selectedField);
  const updateFilter = (next: PanelEditorFilter) => setFilters(replaceAt(filters, index, next));

  return (
    <div className="grid gap-3 rounded-md border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextControl label="Etiqueta" onChange={(label) => updateFilter({ ...filter, label })} value={filter.label ?? ""} />
        <TextControl label="Identificador interno" onChange={(id) => updateFilter({ ...filter, id })} value={filter.id} />
        <FieldSelect
          fields={compatibleFields}
          label="Campo objetivo"
          name={`panelFilterField:${filter.id}`}
          onChange={(fieldId) => {
            const field = compatibleFields.find((item) => item.id === fieldId);
            updateFilter({
              ...filter,
              fieldId,
              valueType: panelValueTypeForField(field),
              operator: panelOperatorsForField(field)[0]?.value as PanelEditorFilter["operator"],
            });
          }}
          preferredType="SELECT"
          value={filter.fieldId ?? ""}
        />
        <SelectControl
          label="Operador"
          name={`panelFilterOperator:${filter.id}`}
          onChange={(operator) => updateFilter({ ...filter, operator: operator as PanelEditorFilter["operator"] })}
          options={operators}
          value={filter.operator ?? operators[0]?.value ?? "EQ"}
        />
      </div>
      <div className="flex justify-end">
        <button className="rounded border border-input px-3 py-1 text-sm" onClick={() => setFilters(filters.filter((_, itemIndex) => itemIndex !== index))} type="button">
          Eliminar
        </button>
      </div>
    </div>
  );
}

function PanelModuleEditor({
  datasets,
  entityTypes,
  index,
  layoutColumns,
  module,
  modules,
  setModules,
}: {
  datasets: PanelEditorDataset[];
  entityTypes: AppViewEntityTypeOption[];
  index: number;
  layoutColumns: number;
  module: PanelEditorModule;
  modules: PanelEditorModule[];
  setModules: (value: PanelEditorModule[]) => void;
}) {
  const dataset = datasets.find((item) => item.id === module.datasetId);
  const datasetFieldIds = dataset?.transformation.fieldIds ?? [];
  const entityType = entityTypes.find((item) => item.id === dataset?.source.entityTypeId);
  const fieldsById = new Map((entityType?.fields ?? []).map((field) => [field.id, field]));
  const datasetFields = datasetFieldIds
    .map((fieldId) => fieldsById.get(fieldId))
    .filter((field): field is AppViewEntityTypeOption["fields"][number] => Boolean(field));
  const columns = module.visualization.config.columns;
  const updateModule = (next: PanelEditorModule) => setModules(replaceAt(modules, index, next));
  const updateColumns = (nextColumns: PanelModule["visualization"]["config"]["columns"]) => updateModule({
    ...module,
    visualization: {
      type: "TABLE",
      config: { ...module.visualization.config, columns: nextColumns },
    },
  });

  return (
    <div className="grid gap-3 rounded-md border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextControl label="Título" onChange={(title) => updateModule({ ...module, title })} value={module.title ?? ""} />
        <TextControl label="Identificador interno" onChange={(id) => updateModule({ ...module, id })} value={module.id} />
        <SelectControl
          label="Dataset asociado"
          name={`panelModuleDataset:${module.id}`}
          onChange={(datasetId) => updateModule({
            ...module,
            datasetId,
            visualization: { type: "TABLE", config: { ...module.visualization.config, columns: [] } },
          })}
          options={[{ label: "Selecciona un dataset", value: "" }, ...datasets.map((item) => ({ label: item.name || item.id, value: item.id }))]}
          value={module.datasetId}
        />
        <SelectControl
          label="Tipo"
          name={`panelModuleType:${module.id}`}
          onChange={() => undefined}
          options={[{ label: "Tabla", value: "TABLE" }]}
          value="TABLE"
        />
      </div>
      <fieldset className="grid gap-2 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">Columnas visibles</legend>
        <div className="grid gap-2">
          {datasetFields.map((field) => {
            const columnIndex = columns.findIndex((column) => column.fieldId === field.id);
            const column = columns[columnIndex];
            const isSelected = Boolean(column);

            return (
              <div className="grid gap-2 rounded-md border border-border px-2 py-2" key={field.id}>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex min-w-0 items-center gap-2 text-sm">
                    <input
                      checked={isSelected}
                      className="h-4 w-4"
                      onChange={(event) => {
                        if (event.target.checked) {
                          updateColumns([...columns, { fieldId: field.id }]);
                        } else {
                          updateColumns(columns.filter((item) => item.fieldId !== field.id));
                        }
                      }}
                      type="checkbox"
                    />
                    <span className="truncate">{field.name}</span>
                  </label>
                  {isSelected ? (
                    <div className="flex shrink-0 gap-1">
                      <button aria-label={`Subir ${field.name}`} className="rounded border border-input px-2 py-1 text-xs disabled:opacity-40" disabled={columnIndex === 0} onClick={() => updateColumns(moveAt(columns, columnIndex, -1))} type="button">
                        Subir
                      </button>
                      <button aria-label={`Bajar ${field.name}`} className="rounded border border-input px-2 py-1 text-xs disabled:opacity-40" disabled={columnIndex === columns.length - 1} onClick={() => updateColumns(moveAt(columns, columnIndex, 1))} type="button">
                        Bajar
                      </button>
                      <button aria-label={`Eliminar ${field.name}`} className="rounded border border-input px-2 py-1 text-xs" onClick={() => updateColumns(columns.filter((item) => item.fieldId !== field.id))} type="button">
                        Eliminar
                      </button>
                    </div>
                  ) : null}
                </div>
                {isSelected ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <SelectControl
                      label="Formato visual"
                      name={`panelColumnFormat:${module.id}:${field.id}`}
                      onChange={(format) => updateColumns(replaceAt(columns, columnIndex, { ...column, format: format || undefined }))}
                      options={panelFormatOptions(field.type)}
                      value={column?.format ?? ""}
                    />
                    {field.type === "SELECT" || field.type === "MULTISELECT" ? (
                      <SelectControl
                        label="Mostrar valores como"
                        name={`panelColumnValueDisplay:${module.id}:${field.id}`}
                        onChange={(valueDisplay) => updateColumns(replaceAt(columns, columnIndex, {
                          ...column,
                          valueDisplay: valueDisplay as ReportSelectValueDisplay,
                        }))}
                        options={[
                          { label: "Etiqueta visible", value: "LABEL" },
                          { label: "Valor interno", value: "INTERNAL_VALUE" },
                        ]}
                        value={column?.valueDisplay ?? "LABEL"}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberControl label="Ancho" max={layoutColumns} min={1} onChange={(w) => updateModule({ ...module, layout: { ...module.layout, w } })} value={module.layout.w} />
        <NumberControl label="Orden" max={99} min={0} onChange={(y) => updateModule({ ...module, layout: { ...module.layout, y } })} value={module.layout.y} />
      </div>
      <div className="flex justify-end gap-2">
        <button aria-label={`Subir módulo ${module.title || module.id}`} className="rounded border border-input px-3 py-1 text-sm disabled:opacity-40" disabled={index === 0} onClick={() => setModules(moveAt(modules, index, -1))} type="button">
          Subir
        </button>
        <button aria-label={`Bajar módulo ${module.title || module.id}`} className="rounded border border-input px-3 py-1 text-sm disabled:opacity-40" disabled={index === modules.length - 1} onClick={() => setModules(moveAt(modules, index, 1))} type="button">
          Bajar
        </button>
        <button className="rounded border border-input px-3 py-1 text-sm" onClick={() => setModules(modules.filter((_, itemIndex) => itemIndex !== index))} type="button">
          Eliminar
        </button>
      </div>
    </div>
  );
}

function ConfigFields({
  activeBoardFields,
  appViews,
  contextFieldIds,
  currentStatusDateFieldId,
  currentStatusStateFieldId,
  currentStatusSubjectFieldId,
  dashboardEntityTypeIds,
  dateFieldId,
  defaultSortDirection,
  defaultSortFieldId,
  displayFieldIds,
  entityTypeId,
  entityTypes,
  extraFieldIds,
  fieldErrors,
  groupByFieldKey,
  historyMode,
  latestByRelationRelatedEntityTypeId,
  defaultCheckInOptionId,
  observationFieldId,
  personFieldId,
  presentationMode,
  requiredStateFieldIds,
  stateFieldDefaultOptionIds,
  reportTimeAllowChange,
  reportTimeDefaultPeriod,
  reportTimeMode,
  reportColumnFieldId,
  reportRowFieldId,
  reportSourceMode,
  reportSummaryFieldId,
  reportValueFieldId,
  reportValueDisplay,
  setContextFieldIds,
  setCurrentStatusDateFieldId,
  setCurrentStatusStateFieldId,
  setCurrentStatusSubjectFieldId,
  setDateFieldId,
  setDefaultCheckInOptionId,
  setDisplayFieldIds,
  setDefaultSortDirection,
  setDefaultSortFieldId,
  setEntityTypeId,
  setExtraFieldIds,
  setGroupByFieldKey,
  setHistoryMode,
  setLatestByRelationRelatedEntityTypeId,
  setObservationFieldId,
  setPersonFieldId,
  setPresentationMode,
  setRequiredStateFieldIds,
  setReportTimeAllowChange,
  setReportTimeDefaultPeriod,
  setReportTimeMode,
  setReportColumnFieldId,
  setReportRowFieldId,
  setReportSourceMode,
  setReportSummaryFieldId,
  setReportValueFieldId,
  setSourceEntityTypeId,
  setStateFieldIds,
  setStateUpdateAppViewId,
  setStatusFieldId,
  setSubjectFieldId,
  setTargetEntityTypeId,
  setUniquenessMode,
  setWorkflowKey,
  sourceEntityTypeId,
  stateFieldIds,
  stateUpdateAppViewId,
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
  appViews: AppViewOption[];
  contextFieldIds: string[];
  currentStatusDateFieldId: string;
  currentStatusStateFieldId: string;
  currentStatusSubjectFieldId: string;
  dashboardEntityTypeIds: Set<string>;
  dateFieldId: string;
  defaultSortDirection: string;
  defaultSortFieldId: string;
  displayFieldIds: string[];
  entityTypeId: string;
  entityTypes: AppViewEntityTypeOption[];
  extraFieldIds: Set<string>;
  fieldErrors?: Record<string, string[]>;
  groupByFieldKey: string;
  historyMode: string;
  latestByRelationRelatedEntityTypeId: string;
  defaultCheckInOptionId: string;
  observationFieldId: string;
  personFieldId: string;
  presentationMode: string;
  requiredStateFieldIds: Set<string>;
  stateFieldDefaultOptionIds: Record<string, string>;
  reportTimeAllowChange: boolean;
  reportTimeDefaultPeriod: string;
  reportTimeMode: string;
  reportColumnFieldId: string;
  reportRowFieldId: string;
  reportSourceMode: string;
  reportSummaryFieldId: string;
  reportValueFieldId: string;
  reportValueDisplay: Record<string, "LABEL" | "INTERNAL_VALUE">;
  setContextFieldIds: (value: string[]) => void;
  setCurrentStatusDateFieldId: (value: string) => void;
  setCurrentStatusStateFieldId: (value: string) => void;
  setCurrentStatusSubjectFieldId: (value: string) => void;
  setDateFieldId: (value: string) => void;
  setDefaultCheckInOptionId: (value: string) => void;
  setDisplayFieldIds: (value: string[]) => void;
  setDefaultSortDirection: (value: string) => void;
  setDefaultSortFieldId: (value: string) => void;
  setEntityTypeId: (value: string) => void;
  setExtraFieldIds: (value: Set<string>) => void;
  setGroupByFieldKey: (value: string) => void;
  setHistoryMode: (value: string) => void;
  setLatestByRelationRelatedEntityTypeId: (value: string) => void;
  setObservationFieldId: (value: string) => void;
  setPersonFieldId: (value: string) => void;
  setPresentationMode: (value: string) => void;
  setRequiredStateFieldIds: (value: Set<string>) => void;
  setReportTimeAllowChange: (value: boolean) => void;
  setReportTimeDefaultPeriod: (value: string) => void;
  setReportTimeMode: (value: string) => void;
  setReportColumnFieldId: (value: string) => void;
  setReportRowFieldId: (value: string) => void;
  setReportSourceMode: (value: string) => void;
  setReportSummaryFieldId: (value: string) => void;
  setReportValueFieldId: (value: string) => void;
  setSourceEntityTypeId: (value: string) => void;
  setStateFieldIds: (value: Set<string>) => void;
  setStateUpdateAppViewId: (value: string) => void;
  setStatusFieldId: (value: string) => void;
  setSubjectFieldId: (value: string) => void;
  setTargetEntityTypeId: (value: string) => void;
  setUniquenessMode: (value: string) => void;
  setWorkflowKey: (value: string) => void;
  sourceEntityTypeId: string;
  stateFieldIds: Set<string>;
  stateUpdateAppViewId: string;
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
    const selectedStateFields = activeTargetFields.filter((field) => stateFieldIds.has(field.id));
    const effectiveExtraFieldIds = new Set(Array.from(extraFieldIds).filter((fieldId) => !stateFieldIds.has(fieldId)));

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
              fields={activeTargetFields.filter((field) =>
                stateUpdateStateFieldTypes.has(field.type) &&
                (!extraFieldIds.has(field.id) || stateFieldIds.has(field.id))
              )}
              label="Campos de estado"
              name="stateFieldIds"
              requiredName="requiredStateFieldIds"
              selected={stateFieldIds}
              requiredSelected={requiredStateFieldIds}
              setRequiredSelected={setRequiredStateFieldIds}
              setSelected={(next) => {
                setStateFieldIds(next);
                setExtraFieldIds(new Set(Array.from(extraFieldIds).filter((fieldId) => !next.has(fieldId))));
              }}
            />
            {selectedStateFields
              .filter((field) => field.type === "SELECT")
              .map((field) => (
                <OptionSelect
                  key={field.id}
                  label={`Opción por defecto · ${field.name}`}
                  name={`stateFieldDefaultOptionId:${field.id}`}
                  onChange={() => undefined}
                  options={field.options.filter((option) => option.isActive)}
                  value={stateFieldDefaultOptionIds[field.id] ?? ""}
                  includeEmpty
                />
              ))}
            <FieldChecklist
              fields={activeTargetFields.filter((field) =>
                stateUpdateExtraFieldTypes.has(field.type) &&
                !stateFieldIds.has(field.id)
              )}
              label="Campos extra"
              name="extraFieldIds"
              selected={effectiveExtraFieldIds}
              setSelected={(next) => {
                setExtraFieldIds(next);
                setStateFieldIds(new Set(Array.from(stateFieldIds).filter((fieldId) => !next.has(fieldId))));
                setRequiredStateFieldIds(new Set(Array.from(requiredStateFieldIds).filter((fieldId) => !next.has(fieldId))));
              }}
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
    const stateUpdateReportOptions = appViews.filter((appView) =>
      appView.active &&
      appView.type === "WORKFLOW" &&
      appView.config.type === "WORKFLOW" &&
      appView.config.workflowKey === "state-update",
    );
    const selectedStateUpdateReportView = stateUpdateReportOptions.find((appView) => appView.id === stateUpdateAppViewId);
    const stateUpdateReportFields = selectedStateUpdateReportView?.config.type === "WORKFLOW"
      ? stateUpdateCurrentReportFields(selectedStateUpdateReportView.config, entityTypes)
      : [];
    const isStateUpdateReport = reportSourceMode === "STATE_UPDATE";
    const stateUpdateSortableFields = stateUpdateReportFields.filter((field) => reportSortableFieldTypes.has(field.type));

    return (
      <fieldset className="grid gap-3 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">Configuración del reporte</legend>
        <SelectControl
          label="Fuente del reporte"
          name="reportSourceMode"
          onChange={(value) => {
            setReportSourceMode(value);
            if (value === "STATE_UPDATE") {
              setPresentationMode("TABLE");
              setDefaultSortFieldId("subject.displayName");
              setVisibleFieldIds(stateUpdateReportFields.map((field) => field.id).filter((fieldId) => fieldId !== "current.updatedAt"));
            }
          }}
          options={[
            { label: "Entidad", value: "ENTITY" },
            { label: "Actualización de estado", value: "STATE_UPDATE" },
          ]}
          value={reportSourceMode}
        />
        {isStateUpdateReport ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <AppViewSelect
              errors={fieldErrors?.stateUpdateAppViewId}
              label="Experiencia"
              name="stateUpdateAppViewId"
              onChange={(value) => {
                setStateUpdateAppViewId(value);
                const nextView = stateUpdateReportOptions.find((appView) => appView.id === value);
                const nextFields = nextView?.config.type === "WORKFLOW"
                  ? stateUpdateCurrentReportFields(nextView.config, entityTypes)
                  : [];

                setVisibleFieldIds(nextFields.map((field) => field.id).filter((fieldId) => fieldId !== "current.updatedAt"));
                setDefaultSortFieldId("subject.displayName");
              }}
              options={stateUpdateReportOptions}
              value={stateUpdateAppViewId}
            />
            <SelectControl
              label="Proyección"
              name="reportProjection"
              onChange={() => undefined}
              options={[{ label: "Estado actual", value: "CURRENT" }]}
              value="CURRENT"
            />
            <SelectControl
              label="Presentación"
              name="presentationMode"
              onChange={() => undefined}
              options={[{ label: "Tabla", value: "TABLE" }]}
              value="TABLE"
            />
          </div>
        ) : (
          <>
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
                const nextRelatedEntityTypeId = relationTargetEntityTypeIds(nextEntityType)[0] || entityTypes[0]?.id || "";
                const nextRelationFields = relationFieldsTargeting(nextEntityType, nextRelatedEntityTypeId);

                setLatestByRelationRelatedEntityTypeId(nextRelatedEntityTypeId);
                setCurrentStatusSubjectFieldId(nextRelationFields.length === 1 ? nextRelationFields[0].id : "");
                setCurrentStatusStateFieldId("");
                setCurrentStatusDateFieldId("");
                setDisplayFieldIds((nextRelationFields.length === 1 ? [nextRelationFields[0].id] : []).filter(Boolean));
              }}
              options={entityTypes}
              value={entityTypeId}
              errors={fieldErrors?.entityTypeId}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {presentationMode === "CURRENT_STATUS" || presentationMode === "LATEST_BY_RELATION" ? null : (
                <FieldSelect
                  fields={activeReportFields}
                  label="Campo de fecha"
                  name="dateFieldId"
                  onChange={setDateFieldId}
                  preferredType="DATE"
                  value={dateFieldId}
                  errors={fieldErrors?.dateFieldId}
                />
              )}
              <SelectControl
                label="Presentación"
                name="presentationMode"
                onChange={setPresentationMode}
                options={[
                  { label: "Tabla", value: "TABLE" },
                  { label: "Matriz", value: "MATRIX" },
                  { label: "Último por relación", value: "LATEST_BY_RELATION" },
                  ...(presentationMode === "CURRENT_STATUS"
                    ? [{ label: "Estado actual (compatibilidad)", value: "CURRENT_STATUS" }]
                    : []),
                ]}
                value={presentationMode}
              />
            </div>
          </>
        )}
        {presentationMode === "CURRENT_STATUS" || presentationMode === "LATEST_BY_RELATION" ? null : (
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
        )}
        {isStateUpdateReport ? (
          <div className="grid gap-3">
            <OrderedVirtualFieldChecklist
              fields={stateUpdateReportFields}
              label="Columnas disponibles"
              name="visibleFieldIds"
              selected={visibleFieldIds}
              setSelected={setVisibleFieldIds}
            />
            <FieldError errors={fieldErrors?.visibleFieldIds} />
            <div className="grid gap-3 sm:grid-cols-2">
              <VirtualFieldSelect
                errors={fieldErrors?.defaultSortFieldId}
                fields={stateUpdateSortableFields}
                includeEmpty
                label="Orden"
                name="defaultSortFieldId"
                onChange={setDefaultSortFieldId}
                value={defaultSortFieldId}
              />
              <SelectControl
                label="Dirección"
                name="defaultSortDirection"
                onChange={setDefaultSortDirection}
                options={[
                  { label: "Ascendente", value: "asc" },
                  { label: "Descendente", value: "desc" },
                ]}
                value={defaultSortDirection}
              />
            </div>
          </div>
        ) : presentationMode === "CURRENT_STATUS" || presentationMode === "LATEST_BY_RELATION" ? (
          <div className="grid gap-3">
            {presentationMode === "LATEST_BY_RELATION" ? (
              <EntitySelect
                label="Entidad relacionada"
                name="latestByRelationRelatedEntityTypeId"
                onChange={(value) => {
                  const compatibleRelationFields = relationFieldsTargeting(reportEntityType, value);

                  setLatestByRelationRelatedEntityTypeId(value);
                  setCurrentStatusSubjectFieldId(compatibleRelationFields.length === 1 ? compatibleRelationFields[0].id : "");
                }}
                options={entityTypes}
                value={latestByRelationRelatedEntityTypeId}
                errors={fieldErrors?.latestByRelationRelatedEntityTypeId}
              />
            ) : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <FieldSelect
                allowedTypes={["RELATION"]}
                fields={presentationMode === "LATEST_BY_RELATION"
                  ? relationFieldsTargeting(reportEntityType, latestByRelationRelatedEntityTypeId)
                  : activeReportFields}
                helpText="Campo que identifica el registro cuyo estado se mostrará"
                label="Registro relacionado"
                name={presentationMode === "LATEST_BY_RELATION" ? "latestByRelationRelationFieldId" : "currentStatusRelationFieldId"}
                onChange={setCurrentStatusSubjectFieldId}
                preferredType="RELATION"
                value={currentStatusSubjectFieldId}
                errors={fieldErrors?.latestByRelationRelationFieldId ?? fieldErrors?.currentStatusRelationFieldId ?? fieldErrors?.currentStatusSubjectFieldId}
              />
              <FieldSelect
                fields={activeReportFields}
                includeEmpty
                label="Campo requerido"
                name={presentationMode === "LATEST_BY_RELATION" ? "latestByRelationRequiredValueFieldId" : "currentStatusRequiredValueFieldId"}
                onChange={setCurrentStatusStateFieldId}
                preferredType="SELECT"
                value={currentStatusStateFieldId}
                errors={fieldErrors?.latestByRelationRequiredValueFieldId ?? fieldErrors?.currentStatusRequiredValueFieldId ?? fieldErrors?.currentStatusStateFieldId}
              />
              <FieldSelect
                fields={sortableFields}
                label="Orden"
                name={presentationMode === "LATEST_BY_RELATION" ? "latestByRelationOrderFieldId" : "currentStatusOrderFieldId"}
                onChange={setCurrentStatusDateFieldId}
                preferredType="DATE"
                value={currentStatusDateFieldId}
                errors={fieldErrors?.latestByRelationOrderFieldId ?? fieldErrors?.currentStatusOrderFieldId ?? fieldErrors?.currentStatusDateFieldId}
                includeEmpty={presentationMode !== "LATEST_BY_RELATION"}
              />
            </div>
            <OrderedFieldChecklist
              fields={activeReportFields}
              label="Columnas visibles"
              name="displayFieldIds"
              selected={displayFieldIds}
              setSelected={setDisplayFieldIds}
            />
            <FieldError errors={fieldErrors?.displayFieldIds} />
            <ReportValueDisplayFields
              fields={reportSelectDisplayFields(activeReportFields, displayFieldIds)}
              valueDisplay={reportValueDisplay}
            />
          </div>
        ) : presentationMode === "MATRIX" ? (
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

function TextControl({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none ring-ring focus-visible:ring-2"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function NumberControl({
  label,
  max,
  min,
  onChange,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none ring-ring focus-visible:ring-2"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        value={value}
      />
    </label>
  );
}

function FieldSelect({
  allowedTypes,
  errors,
  fields,
  helpText,
  includeEmpty = false,
  label,
  name,
  onChange,
  preferredType,
  value,
}: {
  allowedTypes?: string[];
  errors?: string[];
  fields: AppViewEntityTypeOption["fields"];
  helpText?: string;
  includeEmpty?: boolean;
  label: string;
  name: string;
  onChange: (value: string) => void;
  preferredType: string;
  value: string;
}) {
  const selectableFields = allowedTypes ? fields.filter((field) => allowedTypes.includes(field.type)) : fields;
  const preferredFields = selectableFields.filter((field) => field.type === preferredType);
  const otherFields = selectableFields.filter((field) => field.type !== preferredType);

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
      {helpText ? <span className="text-xs font-normal text-muted-foreground">{helpText}</span> : null}
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
  const moveSelectedField = (fieldId: string, direction: -1 | 1) => {
    const index = selectedIds.indexOf(fieldId);

    if (index === -1) return;

    const nextIndex = index + direction;

    if (nextIndex < 0 || nextIndex >= selectedIds.length) return;

    const nextSelected = [...selectedIds];
    const [field] = nextSelected.splice(index, 1);

    nextSelected.splice(nextIndex, 0, field);
    setSelected(nextSelected);
  };

  return (
    <fieldset className="grid gap-2 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      {orderedFields.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay campos SELECT adicionales compatibles.</p>
      ) : (
        <div className="grid gap-2">
          {orderedFields.map((field) => {
            const selectedIndex = selectedIds.indexOf(field.id);
            const isSelected = selectedIndex !== -1;

            return (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1" key={field.id}>
                <label className="flex min-w-0 items-center gap-2 text-sm">
                  <input
                    checked={isSelected}
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
                  <span className="truncate">{field.name}</span>
                </label>
                {isSelected ? (
                  <div className="flex shrink-0 gap-1">
                    <button
                      aria-label={`Subir ${field.name}`}
                      className="rounded border border-input px-2 py-1 text-xs disabled:opacity-40"
                      disabled={selectedIndex === 0}
                      onClick={() => moveSelectedField(field.id, -1)}
                      type="button"
                    >
                      Subir
                    </button>
                    <button
                      aria-label={`Bajar ${field.name}`}
                      className="rounded border border-input px-2 py-1 text-xs disabled:opacity-40"
                      disabled={selectedIndex === selectedIds.length - 1}
                      onClick={() => moveSelectedField(field.id, 1)}
                      type="button"
                    >
                      Bajar
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

function OrderedVirtualFieldChecklist({
  fields,
  label,
  name,
  selected,
  setSelected,
}: {
  fields: ReportVirtualFieldOption[];
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
        <p className="text-sm text-muted-foreground">No hay campos STATE_UPDATE compatibles.</p>
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

function buildPanelConfig({
  baseConfig,
  columns,
  datasets,
  filters,
  modules,
  rowHeight,
}: {
  baseConfig?: PanelConfig;
  columns: number;
  datasets: PanelEditorDataset[];
  filters: PanelEditorFilter[];
  modules: PanelEditorModule[];
  rowHeight: number;
}): PanelConfig {
  const panelFilters = filters.map(panelFilterConfig);
  const filterExpressionsByFieldId = filters
    .filter((filter): filter is PanelEditorFilter & { fieldId: string; operator: "EQ" | "IN" } =>
      Boolean(filter.fieldId) && (filter.operator === "EQ" || filter.operator === "IN"),
    )
    .map((filter): FilterExpr => ({
      type: "PANEL_FILTER",
      filterId: filter.id,
      fieldId: filter.fieldId,
      operator: filter.operator,
    }));

  return {
    ...baseConfig,
    type: "PANEL",
    schemaVersion: 1,
    layout: {
      ...baseConfig?.layout,
      columns,
      rowHeight,
    },
    filters: panelFilters,
    datasets: datasets.map((dataset) => ({
      ...dataset,
      filters: mergePanelFilterExpressions(dataset.filters, filterExpressionsByFieldId),
    })),
    modules,
    metrics: [],
    calculatedFields: [],
  };
}

function mergePanelFilterExpressions(
  existing: FilterExpr[] | undefined,
  panelFilters: FilterExpr[],
) {
  const fieldFilters = existing?.filter((filter) => filter.type === "FIELD_VALUE") ?? [];

  return [...fieldFilters, ...panelFilters];
}

function panelFilterConfig(filter: PanelEditorFilter): PanelFilter {
  const next = { ...filter } as Record<string, unknown>;

  delete next.fieldId;
  delete next.operator;

  return next as PanelFilter;
}

function panelConfigFormValue(config: PanelConfig) {
  const value = { ...config } as Record<string, unknown>;

  delete value.type;

  return value;
}

function panelConfigFromState(state: AppViewActionState) {
  const raw = valueFromState(state, "panelConfig");

  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as PanelConfig
      : undefined;
  } catch {
    return undefined;
  }
}

function panelEditorFilters(config: PanelConfig | undefined): PanelEditorFilter[] {
  if (!config) {
    return [];
  }

  return config.filters.map((filter) => {
    const binding = config.datasets
      .flatMap((dataset) => dataset.filters ?? [])
      .find((item) => item.type === "PANEL_FILTER" && item.filterId === filter.id);

    return {
      ...filter,
      fieldId: binding?.fieldId,
      operator: binding?.operator === "EQ" || binding?.operator === "IN" ? binding.operator : undefined,
    };
  });
}

function panelValueTypeForField(field: AppViewEntityTypeOption["fields"][number] | undefined): PanelFilter["valueType"] {
  if (!field) {
    return "TEXT";
  }
  if (["INTEGER", "DECIMAL", "MONEY"].includes(field.type)) {
    return "NUMBER";
  }
  if (["DATE", "DATETIME"].includes(field.type)) {
    return "DATE";
  }
  if (field.type === "BOOLEAN") {
    return "BOOLEAN";
  }
  if (field.type === "SELECT" || field.type === "MULTISELECT") {
    return "OPTION";
  }
  if (field.type === "RELATION") {
    return "RECORD";
  }

  return "TEXT";
}

function panelOperatorsForField(field: AppViewEntityTypeOption["fields"][number] | undefined) {
  if (!field) {
    return [{ label: "Igual", value: "EQ" }];
  }
  if (field.type === "MULTISELECT") {
    return [{ label: "Incluye", value: "IN" }];
  }

  return [{ label: "Igual", value: "EQ" }];
}

function panelFormatOptions(fieldType: string) {
  if (fieldType === "DATE") {
    return [
      { label: "Sin formato", value: "" },
      { label: "DD-MM-YYYY", value: "DD-MM-YYYY" },
      { label: "YYYY-MM-DD", value: "YYYY-MM-DD" },
    ];
  }
  if (["INTEGER", "DECIMAL", "MONEY"].includes(fieldType)) {
    return [
      { label: "Sin formato", value: "" },
      { label: "Número", value: "NUMBER" },
      { label: "Moneda", value: "MONEY" },
    ];
  }

  return [{ label: "Sin formato", value: "" }];
}

function nextPanelId(prefix: string, existingIds: string[]) {
  let index = existingIds.length + 1;
  let id = `${prefix}-${index}`;

  while (existingIds.includes(id)) {
    index += 1;
    id = `${prefix}-${index}`;
  }

  return id;
}

function replaceAt<T>(items: T[], index: number, value: T) {
  return items.map((item, itemIndex) => itemIndex === index ? value : item);
}

function moveAt<T>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;

  if (nextIndex < 0 || nextIndex >= items.length) {
    return items;
  }

  const next = [...items];
  const [item] = next.splice(index, 1);

  next.splice(nextIndex, 0, item);

  return next;
}

function stateUpdateCurrentReportFields(
  config: AppViewConfig,
  entityTypes: AppViewEntityTypeOption[],
): ReportVirtualFieldOption[] {
  if (config.type !== "WORKFLOW" || config.workflowKey !== "state-update") {
    return [];
  }

  const sourceEntity = entityTypes.find((entityType) => entityType.id === config.sourceEntityTypeId);
  const targetEntity = entityTypes.find((entityType) => entityType.id === config.targetEntityTypeId);

  return [
    {
      id: "subject.displayName",
      name: sourceEntity?.name ?? "Sujeto",
      type: "TEXT",
    },
    ...config.stateFields.map((stateField) => {
      const field = targetEntity?.fields.find((candidate) => candidate.id === stateField.fieldId);

      return {
        id: `state:${stateField.fieldId}`,
        name: stateField.label ?? field?.name ?? stateField.fieldId,
        type: field?.type ?? "TEXT",
      };
    }),
    {
      id: "current.updatedAt",
      name: "Actualizado",
      type: "DATETIME",
    },
  ];
}

function firstActiveFieldId(
  entityType: AppViewEntityTypeOption | undefined,
  type: string,
) {
  return entityType?.fields.find((field) => field.isActive && field.type === type)?.id ?? "";
}

function relationFieldsTargeting(
  entityType: AppViewEntityTypeOption | undefined,
  relatedEntityTypeId: string,
) {
  return entityType?.fields.filter((field) =>
    field.isActive &&
    field.type === "RELATION" &&
    relationTargetEntityTypeId(field.config) === relatedEntityTypeId,
  ) ?? [];
}

function relationTargetEntityTypeIds(entityType: AppViewEntityTypeOption | undefined) {
  return Array.from(new Set(
    entityType?.fields
      .filter((field) => field.isActive && field.type === "RELATION")
      .map((field) => relationTargetEntityTypeId(field.config))
      .filter((entityTypeId): entityTypeId is string => Boolean(entityTypeId)) ?? [],
  ));
}

function relatedEntityTypeIdFromRelation(
  entityType: AppViewEntityTypeOption | undefined,
  relationFieldId: string | undefined,
) {
  const relationField = entityType?.fields.find((field) => field.id === relationFieldId && field.type === "RELATION");

  return relationTargetEntityTypeId(relationField?.config);
}

function relationTargetEntityTypeId(config: unknown) {
  if (!config || typeof config !== "object" || !("targetEntityTypeId" in config)) {
    return "";
  }

  const targetEntityTypeId = (config as { targetEntityTypeId?: unknown }).targetEntityTypeId;

  return typeof targetEntityTypeId === "string" ? targetEntityTypeId : "";
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

function AppViewSelect({
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
  options: AppViewOption[];
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
        <option value="">Selecciona una experiencia</option>
        {options.map((appView) => (
          <option key={appView.id} value={appView.id}>
            {appView.name}
          </option>
        ))}
      </select>
      <FieldError errors={errors} />
    </label>
  );
}

function VirtualFieldSelect({
  errors,
  fields,
  includeEmpty = false,
  label,
  name,
  onChange,
  value,
}: {
  errors?: string[];
  fields: ReportVirtualFieldOption[];
  includeEmpty?: boolean;
  label: string;
  name: string;
  onChange: (value: string) => void;
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
        {includeEmpty ? <option value="">Sin orden</option> : null}
        {fields.map((field) => (
          <option key={field.id} value={field.id}>
            {field.name}
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
