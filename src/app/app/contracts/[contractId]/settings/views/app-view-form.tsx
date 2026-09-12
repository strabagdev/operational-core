"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AppViewType } from "@prisma/client";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  Filter,
  Grid3X3,
  LayoutDashboard,
  Maximize2,
  Monitor,
  Pencil,
  Plus,
  Settings2,
  Smartphone,
  Trash2,
} from "lucide-react";

import { EntityIcon } from "@/components/entity-icon";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  appViewTypeOptions,
  appViewWorkflowOptions,
  type AppViewConfig,
  type DatasetDefinition,
  type FilterExpr,
  type PanelConfig,
  type PanelFilter,
  type PanelKpiConfig,
  type PanelKpiFormat,
  type PanelMetric,
  type PanelMetricAggregation,
  type PanelMetricCondition,
  type PanelMetricConditionOperator,
  type PanelMetricConditionValue,
  type PanelModule,
  type PanelPercentScale,
  type ReportSelectValueDisplay,
  suggestedAppViewSlug,
} from "@/lib/app-views";
import { entityIconOptions } from "@/lib/entity-icons";
import { cn } from "@/lib/utils";

import type { AppViewActionState } from "./actions";
import { PanelEditorSheet, PanelEditorTopBar } from "./panel-editor-chrome";

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
type PanelEditorMetric = PanelMetric;
type PanelTableColumns = Extract<PanelModule["visualization"], { type: "TABLE" }>["config"]["columns"];

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

type PanelEditorSectionId =
  | "datos-generales"
  | "fuentes-de-datos"
  | "filtros"
  | "metricas"
  | "modulos"
  | "diseno";

type PanelEditorSheetKind = "dataset" | "filter" | "metric" | "module";

type PanelEditorSheetState = {
  index: number | null;
  kind: PanelEditorSheetKind;
} | null;

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
  useEffect(() => {
    const url = new URL(window.location.href);

    if (!url.searchParams.has("error") && !url.searchParams.has("notice")) {
      return;
    }

    url.searchParams.delete("error");
    url.searchParams.delete("notice");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);
  const [name, setName] = useState(valueFromState(state, "name", initialValues?.name ?? ""));
  const [slug, setSlug] = useState(valueFromState(state, "slug", initialValues?.slug ?? ""));
  const [slugTouched, setSlugTouched] = useState(Boolean(initialValues?.slug));
  const [type, setType] = useState<AppViewType>(
    valueFromState(state, "type", initialValues?.type ?? "RECORDS") as AppViewType,
  );
  const [icon, setIcon] = useState(valueFromState(state, "icon", initialValues?.icon ?? ""));
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
  const [panelMetrics, setPanelMetrics] = useState<PanelEditorMetric[]>(
    initialPanelConfig?.metrics ?? [],
  );
  const [panelLayoutColumns, setPanelLayoutColumns] = useState(
    initialPanelConfig?.layout.columns ?? 12,
  );
  const [panelLayoutRowHeight, setPanelLayoutRowHeight] = useState(
    initialPanelConfig?.layout.rowHeight ?? 8,
  );
  const [panelNotice, setPanelNotice] = useState("");
  const [activePanelSection, setActivePanelSection] = useState<PanelEditorSectionId>(
    firstPanelErrorSection(state.fieldErrors) ?? "datos-generales",
  );
  const [previewExpanded, setPreviewExpanded] = useState(true);
  const [active, setActive] = useState(
    state.values ? valueFromState(state, "active") === "on" : initialValues?.active ?? true,
  );
  const [sortOrder, setSortOrder] = useState(
    valueFromState(state, "sortOrder", String(initialValues?.sortOrder ?? 0)),
  );
  const panelConfig = buildPanelConfig({
    baseConfig: initialPanelConfig,
    datasets: panelDatasets,
    filters: panelFilters,
    metrics: panelMetrics,
    modules: panelModules,
    columns: panelLayoutColumns,
    rowHeight: panelLayoutRowHeight,
  });
  const normalizedInitialPanelConfig = initialValues?.config.type === "PANEL"
    ? buildPanelConfig({
        baseConfig: initialValues.config,
        datasets: initialValues.config.datasets,
        filters: panelEditorFilters(initialValues.config),
        metrics: initialValues.config.metrics,
        modules: initialValues.config.modules,
        columns: initialValues.config.layout.columns,
        rowHeight: initialValues.config.layout.rowHeight ?? 8,
      })
    : undefined;
  const initialPanelSnapshot = normalizedInitialPanelConfig
    ? JSON.stringify(panelConfigFormValue(normalizedInitialPanelConfig))
    : "";
  const panelDirty = type === "PANEL" && (
    name !== (initialValues?.name ?? "") ||
    slug !== (initialValues?.slug ?? "") ||
    icon !== (initialValues?.icon ?? "") ||
    active !== (initialValues?.active ?? true) ||
    sortOrder !== String(initialValues?.sortOrder ?? 0) ||
    JSON.stringify(panelConfigFormValue(panelConfig)) !== initialPanelSnapshot
  );

  useEffect(() => {
    if (type !== "PANEL") {
      return;
    }

    const nextSection = firstPanelErrorSection(state.fieldErrors);

    if (nextSection && nextSection !== activePanelSection) {
      const timeoutId = window.setTimeout(() => setActivePanelSection(nextSection), 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, [activePanelSection, state.fieldErrors, type]);
  function toggleDashboardEntity(entityTypeId: string, checked: boolean) {
    const next = new Set(dashboardEntityTypeIds);

    if (checked) {
      next.add(entityTypeId);
    } else {
      next.delete(entityTypeId);
    }

    setDashboardEntityTypeIds(next);
  }

  const generalSection = (
    <section
      aria-labelledby={type === "PANEL" ? "panel-section-datos-generales" : undefined}
      className={type === "PANEL" ? "grid gap-4" : "contents"}
      data-panel-section={type === "PANEL" ? "datos-generales" : undefined}
      id="datos-generales"
    >
      {type === "PANEL" ? (
        <PanelSectionHeader
          description="Define la identidad del panel y su estado general."
          id="panel-section-datos-generales"
          title="Datos generales"
          tone="general"
        />
      ) : null}
      <div className={type === "PANEL" ? "grid gap-4" : "grid gap-4"}>
        <div className={type === "PANEL" ? "grid min-w-0 gap-3 lg:grid-cols-2" : "grid gap-4"}>
          <label className="grid min-w-0 gap-2 text-sm font-medium">
            Nombre
            <input
              className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
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

          <label className="grid min-w-0 gap-2 text-sm font-medium">
            Slug
            <input
              className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
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
        </div>

        <div className={type === "PANEL" ? "grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_minmax(10rem,auto)]" : "grid gap-4"}>
          <label className="grid min-w-0 gap-2 text-sm font-medium">
            Icono opcional
            <select
              className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none ring-ring focus-visible:ring-2"
              name="icon"
              onChange={(event) => setIcon(event.target.value)}
              value={icon}
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

          <label className="grid min-w-0 gap-2 text-sm font-medium">
            Tipo
            <select
              className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none ring-ring focus-visible:ring-2"
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
            <>
              <label className="grid min-w-0 gap-2 text-sm font-medium">
                Orden
                <input
                  className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
                  min={0}
                  name="sortOrder"
                  onChange={(event) => setSortOrder(event.target.value)}
                  type="number"
                  value={sortOrder}
                />
              </label>
              <label
                className="grid min-w-0 cursor-pointer gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm font-medium"
                data-panel-active-control="true"
              >
                Estado de la experiencia
                <span className="flex min-w-0 items-center justify-between gap-3">
                  <span className="truncate text-sm font-normal">{active ? "Activa" : "Inactiva"}</span>
                  <span className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
                    active ? "border-emerald-300 bg-emerald-100" : "border-slate-300 bg-slate-100",
                  )}>
                    {!active ? <input name="active" type="hidden" value="false" /> : null}
                    <input
                      checked={active}
                      className="peer sr-only"
                      name="active"
                      onChange={(event) => setActive(event.target.checked)}
                      type="checkbox"
                    />
                    <span className={cn(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow-sm transition-transform",
                      active ? "translate-x-5" : "translate-x-0.5",
                    )} />
                  </span>
                </span>
              </label>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );

  return (
    <form action={formAction} className={type === "PANEL" ? "grid w-full gap-4" : "grid gap-4"}>
      <ActionErrorSummary state={state} />
      {type === "PANEL" ? (
        <PanelEditorTopBar
          actionPending={actionPending}
          active={active}
          dirty={panelDirty}
          name={name || "Panel sin nombre"}
          submitLabel={submitLabel}
        />
      ) : null}
      {type === "PANEL" && activePanelSection !== "datos-generales" ? (
        <PanelHiddenGeneralFields
          active={active}
          icon={icon}
          name={name}
          slug={slug}
          sortOrder={sortOrder}
          type={type}
        />
      ) : null}

      {type !== "PANEL" ? generalSection : null}

      {type === "PANEL" ? (
        <PanelConfigFields
          activeSection={activePanelSection}
          config={panelConfig}
          datasets={panelDatasets}
          entityTypes={entityTypes}
          fieldErrors={state.fieldErrors}
          filters={panelFilters}
          generalSection={generalSection}
          layoutColumns={panelLayoutColumns}
          layoutRowHeight={panelLayoutRowHeight}
          modules={panelModules}
          metrics={panelMetrics}
          notice={panelNotice}
          previewExpanded={previewExpanded}
          setActiveSection={setActivePanelSection}
          setDatasets={setPanelDatasets}
          setFilters={setPanelFilters}
          setLayoutColumns={setPanelLayoutColumns}
          setLayoutRowHeight={setPanelLayoutRowHeight}
          setModules={setPanelModules}
          setMetrics={setPanelMetrics}
          setNotice={setPanelNotice}
          setPreviewExpanded={setPreviewExpanded}
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

      {type !== "PANEL" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            Orden
            <input
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
              min={0}
              name="sortOrder"
              onChange={(event) => setSortOrder(event.target.value)}
              type="number"
              value={sortOrder}
            />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm font-medium">
            {!active ? <input name="active" type="hidden" value="false" /> : null}
            <input
              checked={active}
              className="h-4 w-4"
              name="active"
              onChange={(event) => setActive(event.target.checked)}
              type="checkbox"
            />
            Activa
          </label>
        </div>
      ) : null}

      <div className="sticky bottom-0 z-10 flex justify-end border-t border-border bg-background/95 py-3">
        <Button disabled={actionPending} type="submit">
          {actionPending ? "Guardando..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function PanelConfigFields({
  activeSection,
  config,
  datasets,
  entityTypes,
  fieldErrors,
  filters,
  generalSection,
  layoutColumns,
  layoutRowHeight,
  metrics,
  modules,
  notice,
  previewExpanded,
  setActiveSection,
  setDatasets,
  setFilters,
  setLayoutColumns,
  setLayoutRowHeight,
  setMetrics,
  setModules,
  setNotice,
  setPreviewExpanded,
}: {
  activeSection: PanelEditorSectionId;
  config: PanelConfig;
  datasets: PanelEditorDataset[];
  entityTypes: AppViewEntityTypeOption[];
  fieldErrors?: Record<string, string[]>;
  filters: PanelEditorFilter[];
  generalSection: ReactNode;
  layoutColumns: number;
  layoutRowHeight: number;
  metrics: PanelEditorMetric[];
  modules: PanelEditorModule[];
  notice: string;
  previewExpanded: boolean;
  setActiveSection: (value: PanelEditorSectionId) => void;
  setDatasets: (value: PanelEditorDataset[]) => void;
  setFilters: (value: PanelEditorFilter[]) => void;
  setLayoutColumns: (value: number) => void;
  setLayoutRowHeight: (value: number) => void;
  setMetrics: (value: PanelEditorMetric[]) => void;
  setModules: (value: PanelEditorModule[]) => void;
  setNotice: (value: string) => void;
  setPreviewExpanded: (value: boolean) => void;
}) {
  const layoutOverlaps = panelModuleLayoutOverlaps(modules);
  const [sheet, setSheet] = useState<PanelEditorSheetState>(null);
  const [selectedLayoutModuleId, setSelectedLayoutModuleId] = useState(modules[0]?.id ?? "");
  const selectedLayoutModule = modules.find((module) => module.id === selectedLayoutModuleId) ?? modules[0];
  const sections = panelEditorSections({
    activeSection,
    datasets,
    fieldErrors,
    filters,
    layoutOverlaps,
    metrics,
    modules,
  });
  const openSheet = (kind: PanelEditorSheetKind, index: number | null = null) => setSheet({ kind, index });

  useEffect(() => {
    if (!selectedLayoutModule && modules[0]) {
      const timeoutId = window.setTimeout(() => setSelectedLayoutModuleId(modules[0].id), 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, [modules, selectedLayoutModule]);

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Configuración del panel</legend>
      <input name="panelConfig" type="hidden" value={JSON.stringify(panelConfigFormValue(config))} />
      <div className="grid min-h-[calc(100vh-13rem)] min-w-0 gap-4 lg:grid-cols-[190px_minmax(0,1fr)] 2xl:grid-cols-[210px_minmax(560px,1fr)_minmax(420px,0.7fr)]">
        <PanelEditorNavigation
          onSelect={setActiveSection}
          sections={sections}
        />
        <div className="min-w-0 overflow-hidden rounded-md border border-border bg-background shadow-sm">
          <div className="max-h-[calc(100vh-14rem)] overflow-auto p-4">
            <PanelErrorSummary fieldErrors={fieldErrors} onSelectSection={setActiveSection} />
            <FieldError errors={fieldErrors?.panelConfig} />
            {notice ? (
              <p className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900" role="status">
                {notice}
              </p>
            ) : null}

            {activeSection === "datos-generales" ? generalSection : null}

            {activeSection === "fuentes-de-datos" ? (
              <section className="grid gap-4" data-panel-section="fuentes-de-datos" id="fuentes-de-datos">
                <PanelSectionHeader
                  actionLabel="Agregar dataset"
                  description="Define las entidades, transformaciones y campos que alimentan el panel."
                  id="panel-section-fuentes-de-datos"
                  onAction={() => openSheet("dataset")}
                  title="Fuentes de datos"
                  tone="datasets"
                />
                <FieldError errors={fieldErrors?.datasets} />
                {datasets.length === 0 ? (
                  <PanelEmptyState label="No hay datasets configurados." />
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {datasets.map((dataset, index) => (
                      <PanelDatasetCard
                        dataset={dataset}
                        entityTypes={entityTypes}
                        key={dataset.id}
                        onDelete={() => {
                          const next = removePanelDatasetAt({ datasets, filters, metrics, modules }, index);

                          setDatasets(next.datasets);
                          setFilters(next.filters);
                          setMetrics(next.metrics);
                          setModules(next.modules);
                        }}
                        onEdit={() => openSheet("dataset", index)}
                      />
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {activeSection === "filtros" ? (
              <section className="grid gap-4" data-panel-section="filtros" id="filtros">
                <PanelSectionHeader
                  actionLabel="Agregar filtro"
                  description="Crea filtros visibles para reutilizarlos en datasets y métricas."
                  id="panel-section-filtros"
                  onAction={datasets.length === 0 ? undefined : () => openSheet("filter")}
                  title="Filtros"
                  tone="filters"
                />
                {filters.length === 0 ? (
                  <PanelEmptyState label="Sin filtros de panel." />
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {filters.map((filter, index) => (
                      <PanelFilterCard
                        datasets={datasets}
                        entityTypes={entityTypes}
                        filter={filter}
                        key={filter.id}
                        onDelete={() => {
                          const next = removePanelFilterAt({ filters, metrics }, index);

                          setFilters(next.filters);
                          setMetrics(next.metrics);
                        }}
                        onEdit={() => openSheet("filter", index)}
                      />
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {activeSection === "metricas" ? (
              <section className="grid gap-4" data-panel-section="metricas" id="metricas">
                <PanelSectionHeader
                  actionLabel="Agregar métrica"
                  description="Configura KPIs calculados por Core a partir del dataset transformado."
                  id="panel-section-metricas"
                  onAction={datasets.length === 0 ? undefined : () => openSheet("metric")}
                  title="Métricas"
                  tone="metrics"
                />
                <FieldError errors={fieldErrors?.metrics} />
                {metrics.length === 0 ? (
                  <PanelEmptyState label="Sin métricas configuradas." />
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {metrics.map((metric, index) => (
                      <PanelMetricCard
                        datasets={datasets}
                        entityTypes={entityTypes}
                        key={metric.id}
                        metric={metric}
                        onDelete={() => {
                          const next = removePanelMetricAt({ metrics, modules }, index);

                          setMetrics(next.metrics);
                          setModules(next.modules);
                        }}
                        onEdit={() => openSheet("metric", index)}
                      />
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {activeSection === "modulos" ? (
              <section className="grid gap-4" data-panel-section="modulos" id="modulos">
                <PanelSectionHeader
                  actionLabel="Agregar módulo"
                  description="Ubica tablas e indicadores sobre el layout del panel."
                  id="panel-section-modulos"
                  onAction={datasets.length === 0 ? undefined : () => openSheet("module")}
                  title="Módulos"
                  tone="modules"
                />
                <FieldError errors={fieldErrors?.modules} />
                {modules.length === 0 ? (
                  <PanelEmptyState label="No hay módulos configurados." />
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {sortPanelModulesByLayout(modules).map((module, spatialIndex, spatialModules) => {
                      const index = modules.findIndex((item) => item.id === module.id);
                      const overlapWarnings = layoutOverlaps
                        .filter((overlap) => overlap.left.id === module.id || overlap.right.id === module.id)
                        .map((overlap) => {
                          const other = overlap.left.id === module.id ? overlap.right : overlap.left;

                          return `Se solapa con ${other.title || other.id}.`;
                        });

                      const moduleMetric = module.visualization.type === "KPI"
                        ? metrics.find((item) => item.id === (module.visualization as Extract<PanelModule["visualization"], { type: "KPI" }>).config.metricId)
                        : undefined;

                      return (
                        <PanelModuleCard
                          datasets={datasets}
                          entityTypes={entityTypes}
                          key={module.id}
                          metric={moduleMetric}
                          module={module}
                          onDelete={() => setModules(removePanelModuleAt(modules, index))}
                          onEdit={() => openSheet("module", index)}
                          onMoveDown={spatialIndex === spatialModules.length - 1
                            ? undefined
                            : () => setModules(packPanelModules(moveAt(spatialModules, spatialIndex, 1), layoutColumns))}
                          onMoveUp={spatialIndex === 0
                            ? undefined
                            : () => setModules(packPanelModules(moveAt(spatialModules, spatialIndex, -1), layoutColumns))}
                          warnings={overlapWarnings}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}

            {activeSection === "diseno" ? (
              <section className="grid gap-4" data-panel-section="diseno" id="diseno">
                <PanelSectionHeader
                  actionLabel="Organizar automáticamente"
                  description="Ajusta la grilla de 12 columnas, posiciones y tamaño de cada módulo."
                  id="panel-section-diseno"
                  onAction={layoutOverlaps.length === 0 ? undefined : () => setModules(packPanelModules(modules, layoutColumns))}
                  title="Diseño"
                  tone="layout"
                />
                {layoutOverlaps.length > 0 ? (
                  <div className="grid gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {layoutOverlaps.map((overlap) => (
                      <span key={`${overlap.left.id}:${overlap.right.id}`}>
                        Los módulos {overlap.left.title || overlap.left.id} y {overlap.right.title || overlap.right.id} se solapan en el layout.
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberControl label="Columnas de grilla" max={24} min={1} onChange={setLayoutColumns} value={layoutColumns} />
                  <NumberControl label="Alto de fila" max={64} min={1} onChange={setLayoutRowHeight} value={layoutRowHeight} />
                </div>
                <PanelLayoutCanvas
                  layoutColumns={layoutColumns}
                  layoutRowHeight={layoutRowHeight}
                  modules={modules}
                  onSelect={setSelectedLayoutModuleId}
                  selectedModuleId={selectedLayoutModule?.id ?? ""}
                />
                {selectedLayoutModule ? (
                  <div className="grid gap-3 rounded-md border border-border bg-muted/20 p-3">
                    <h4 className="text-sm font-medium">Inspector de módulo</h4>
                    <p className="text-sm text-muted-foreground">{selectedLayoutModule.title || selectedLayoutModule.id}</p>
                    <div className="grid gap-3 sm:grid-cols-4">
                      {(["x", "y", "w", "h"] as const).map((key) => (
                        <NumberControl
                          key={key}
                          label={key.toUpperCase()}
                          max={key === "w" ? layoutColumns : 99}
                          min={key === "x" || key === "y" ? 0 : 1}
                          onChange={(value) => setModules(modules.map((module) =>
                            module.id === selectedLayoutModule.id
                              ? { ...module, layout: { ...module.layout, [key]: value } }
                              : module,
                          ))}
                          value={selectedLayoutModule.layout[key]}
                        />
                      ))}
                    </div>
                    <FieldError errors={fieldErrors?.layout} />
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        </div>
        {previewExpanded ? (
          <PanelPreview
            datasets={datasets}
            entityTypes={entityTypes}
            layoutColumns={layoutColumns}
            layoutRowHeight={layoutRowHeight}
            metrics={metrics}
            modules={modules}
            onToggle={() => setPreviewExpanded(false)}
          />
        ) : (
          <button
            className="h-fit rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm lg:col-span-2 lg:w-fit lg:justify-self-end 2xl:col-span-1 2xl:flex 2xl:items-center 2xl:gap-2"
            onClick={() => setPreviewExpanded(true)}
            type="button"
          >
            <Eye className="h-4 w-4" />
            Mostrar preview
          </button>
        )}
      </div>
      {sheet?.kind === "dataset" ? (
        <PanelDatasetSheet
          datasets={datasets}
          entityTypes={entityTypes}
          fieldErrors={fieldErrors}
          filters={filters}
          index={sheet.index}
          metrics={metrics}
          modules={modules}
          onClose={() => setSheet(null)}
          open
          setDatasets={setDatasets}
          setFilters={setFilters}
          setMetrics={setMetrics}
          setModules={setModules}
          setNotice={setNotice}
        />
      ) : null}
      {sheet?.kind === "filter" ? (
        <PanelFilterSheet
          datasets={datasets}
          entityTypes={entityTypes}
          filters={filters}
          index={sheet.index}
          onClose={() => setSheet(null)}
          open
          setFilters={setFilters}
        />
      ) : null}
      {sheet?.kind === "metric" ? (
        <PanelMetricSheet
          datasets={datasets}
          entityTypes={entityTypes}
          filters={filters}
          index={sheet.index}
          metrics={metrics}
          onClose={() => setSheet(null)}
          open
          setMetrics={setMetrics}
        />
      ) : null}
      {sheet?.kind === "module" ? (
        <PanelModuleSheet
          datasets={datasets}
          entityTypes={entityTypes}
          fieldErrors={fieldErrors}
          index={sheet.index}
          layoutColumns={layoutColumns}
          metrics={metrics}
          modules={modules}
          onClose={() => setSheet(null)}
          open
          setModules={setModules}
        />
      ) : null}
    </fieldset>
  );
}

function PanelEditorNavigation({
  onSelect,
  sections,
}: {
  onSelect: (section: PanelEditorSectionId) => void;
  sections: ReturnType<typeof panelEditorSections>;
}) {
  return (
    <nav
      aria-label="Navegación del editor PANEL"
      className="grid h-fit min-w-0 gap-2 rounded-md border border-border bg-background p-2 shadow-sm lg:sticky lg:top-20"
    >
      {sections.map((section) => {
        const Icon = section.icon;

        return (
          <button
            aria-current={section.active ? "page" : undefined}
            className={cn(
              "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
              section.active ? section.activeClassName : "border-transparent hover:border-border hover:bg-muted/50",
            )}
            key={section.id}
            onClick={() => onSelect(section.id)}
            type="button"
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate font-medium">{section.label}</span>
              <span className="text-xs text-muted-foreground">{section.countLabel}</span>
            </span>
            <span className="flex items-center gap-1">
              {section.hasError ? <AlertCircle className="h-4 w-4 text-destructive" /> : null}
              {section.complete ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function PanelHiddenGeneralFields({
  active,
  icon,
  name,
  slug,
  sortOrder,
  type,
}: {
  active: boolean;
  icon: string;
  name: string;
  slug: string;
  sortOrder: string;
  type: AppViewType;
}) {
  return (
    <>
      <input name="name" type="hidden" value={name} />
      <input name="slug" type="hidden" value={slug} />
      <input name="icon" type="hidden" value={icon} />
      <input name="type" type="hidden" value={type} />
      <input name="sortOrder" type="hidden" value={sortOrder} />
      <input name="active" type="hidden" value={active ? "true" : "false"} />
    </>
  );
}

function PanelSectionHeader({
  actionLabel,
  description,
  id,
  onAction,
  title,
  tone,
}: {
  actionLabel?: string;
  description: string;
  id: string;
  onAction?: () => void;
  title: string;
  tone: "datasets" | "filters" | "general" | "layout" | "metrics" | "modules";
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 rounded-md border px-3 py-3", panelToneClassName(tone))}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold" id={id}>{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {actionLabel ? (
        <Button disabled={!onAction} onClick={onAction} size="sm" type="button" variant="outline">
          <Plus className="h-4 w-4" />
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

function PanelEmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function PanelDatasetCard({
  dataset,
  entityTypes,
  onDelete,
  onEdit,
}: {
  dataset: PanelEditorDataset;
  entityTypes: AppViewEntityTypeOption[];
  onDelete: () => void;
  onEdit: () => void;
}) {
  const entityType = entityTypes.find((item) => item.id === dataset.source.entityTypeId);

  return (
    <PanelSummaryCard
      actions={<CardActions onDelete={onDelete} onEdit={onEdit} />}
      eyebrow={dataset.transformation.type === "LATEST_BY_RELATION" ? "Último por relación" : "Registros"}
      tone="datasets"
      title={dataset.name || "Dataset sin nombre"}
    >
      <PanelInfoGrid items={[
        ["Entidad", entityType?.name ?? "Sin entidad"],
        ["Campos", String(dataset.transformation.fieldIds.length)],
        ["Paginación", String(dataset.transformation.pagination?.pageSize ?? 25)],
      ]} />
    </PanelSummaryCard>
  );
}

function PanelFilterCard({
  datasets,
  entityTypes,
  filter,
  onDelete,
  onEdit,
}: {
  datasets: PanelEditorDataset[];
  entityTypes: AppViewEntityTypeOption[];
  filter: PanelEditorFilter;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const dataset = datasets.find((item) => item.filters?.some((binding) => binding.type === "PANEL_FILTER" && binding.filterId === filter.id)) ?? datasets[0];
  const field = fieldsForPanelDataset(dataset, entityTypes).find((item) => item.id === filter.fieldId);

  return (
    <PanelSummaryCard actions={<CardActions onDelete={onDelete} onEdit={onEdit} />} eyebrow={filter.required ? "Requerido" : "Opcional"} tone="filters" title={filter.label || "Filtro sin nombre"}>
      <PanelInfoGrid items={[
        ["Dataset", dataset?.name || dataset?.id || "Sin dataset"],
        ["Campo", field?.name ?? "Sin campo"],
        ["Operador", filter.operator === "IN" ? "Incluye" : "Es igual"],
      ]} />
    </PanelSummaryCard>
  );
}

function PanelMetricCard({
  datasets,
  entityTypes,
  metric,
  onDelete,
  onEdit,
}: {
  datasets: PanelEditorDataset[];
  entityTypes: AppViewEntityTypeOption[];
  metric: PanelEditorMetric;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const dataset = datasets.find((item) => item.id === metric.datasetId);
  const fields = fieldsForPanelDataset(dataset, entityTypes);
  const field = metric.fieldId ? fields.find((item) => item.id === metric.fieldId) : undefined;
  const summary = panelMetricReadableSummary(metric, dataset, field, fields);

  return (
    <PanelSummaryCard actions={<CardActions onDelete={onDelete} onEdit={onEdit} />} eyebrow={metric.aggregation} tone="metrics" title={metric.name || "Métrica sin nombre"}>
      <p className="text-sm text-muted-foreground">{summary}</p>
      <PanelInfoGrid items={[
        ["Dataset", dataset?.name || dataset?.id || "Sin dataset"],
        ["Campo", field?.name ?? (metric.aggregation === "COUNT" ? "No requiere" : "Sin campo")],
      ]} />
    </PanelSummaryCard>
  );
}

function PanelModuleCard({
  datasets,
  entityTypes,
  metric,
  module,
  onDelete,
  onEdit,
  onMoveDown,
  onMoveUp,
  warnings,
}: {
  datasets: PanelEditorDataset[];
  entityTypes: AppViewEntityTypeOption[];
  metric?: PanelEditorMetric;
  module: PanelEditorModule;
  onDelete: () => void;
  onEdit: () => void;
  onMoveDown?: () => void;
  onMoveUp?: () => void;
  warnings: string[];
}) {
  const dataset = datasets.find((item) => item.id === module.datasetId);
  const entityType = entityTypes.find((item) => item.id === dataset?.source.entityTypeId);

  return (
    <PanelSummaryCard
      actions={(
        <div className="flex flex-wrap justify-end gap-1">
          <IconButton disabled={!onMoveUp} label="Subir módulo" onClick={onMoveUp} icon={ArrowUp} />
          <IconButton disabled={!onMoveDown} label="Bajar módulo" onClick={onMoveDown} icon={ArrowDown} />
          <CardActions onDelete={onDelete} onEdit={onEdit} />
        </div>
      )}
      eyebrow={module.visualization.type}
      tone="modules"
      title={module.title || "Módulo sin título"}
      warning={warnings.length > 0}
    >
      <PanelInfoGrid items={[
        ["Dataset", dataset?.name || dataset?.id || "Sin dataset"],
        ["Entidad", entityType?.name ?? "Sin entidad"],
        ["Métrica", module.visualization.type === "KPI" ? metric?.name ?? "Sin métrica" : "No aplica"],
        ["Tamaño", `${module.layout.w}x${module.layout.h}`],
        ["Posición", `x${module.layout.x} y${module.layout.y}`],
      ]} />
      {warnings.length > 0 ? (
        <div className="grid gap-1 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          {warnings.map((warning) => <span key={warning}>{warning}</span>)}
        </div>
      ) : null}
    </PanelSummaryCard>
  );
}

function PanelSummaryCard({
  actions,
  children,
  eyebrow,
  title,
  tone,
  warning = false,
}: {
  actions: ReactNode;
  children: ReactNode;
  eyebrow: string;
  title: string;
  tone: "datasets" | "filters" | "metrics" | "modules";
  warning?: boolean;
}) {
  return (
    <article className={cn("grid min-w-0 gap-3 rounded-md border bg-background p-3 shadow-sm", warning ? "border-destructive/50" : "border-border")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("w-fit rounded-full px-2 py-0.5 text-xs font-medium", panelBadgeClassName(tone))}>{eyebrow}</p>
          <h4 className="mt-2 truncate text-sm font-semibold" title={title}>{title}</h4>
        </div>
        {actions}
      </div>
      {children}
    </article>
  );
}

function PanelInfoGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div className="min-w-0" key={label}>
          <dt className="font-medium text-foreground">{label}</dt>
          <dd className="truncate" title={value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CardActions({ onDelete, onEdit }: { onDelete: () => void; onEdit: () => void }) {
  return (
    <div className="flex shrink-0 gap-1">
      <IconButton label="Editar" onClick={onEdit} icon={Pencil} />
      <IconButton label="Eliminar" onClick={onDelete} icon={Trash2} />
    </div>
  );
}

function IconButton({
  disabled,
  icon: Icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: typeof Pencil;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Button aria-label={label} disabled={disabled} onClick={onClick} size="icon" type="button" variant="ghost">
      <Icon className="h-4 w-4" />
    </Button>
  );
}

function PanelLayoutCanvas({
  layoutColumns,
  layoutRowHeight,
  modules,
  onSelect,
  selectedModuleId,
}: {
  layoutColumns: number;
  layoutRowHeight: number;
  modules: PanelEditorModule[];
  onSelect: (moduleId: string) => void;
  selectedModuleId: string;
}) {
  return (
    <div
      aria-label="Canvas de layout PANEL"
      className="grid max-w-full gap-2 overflow-x-auto rounded-md border border-dashed border-border bg-slate-50/60 p-2"
      style={{
        gridAutoRows: `${Math.max(layoutRowHeight * 4, 32)}px`,
        gridTemplateColumns: `repeat(${Math.max(layoutColumns, 1)}, minmax(0, 1fr))`,
      }}
    >
      {modules.length === 0 ? (
        <p className="col-span-12 text-sm text-muted-foreground">No hay módulos para ubicar.</p>
      ) : sortPanelModulesByLayout(modules).map((module) => (
        <button
          className={cn(
            "grid min-w-0 content-start gap-1 rounded-md border bg-background p-2 text-left text-xs shadow-sm",
            selectedModuleId === module.id ? "border-primary ring-2 ring-primary/20" : "border-border",
          )}
          key={module.id}
          onClick={() => onSelect(module.id)}
          style={{
            gridColumn: `${Math.max(module.layout.x, 0) + 1} / span ${Math.min(Math.max(module.layout.w, 1), layoutColumns || 12)}`,
            gridRow: `${Math.max(module.layout.y, 0) + 1} / span ${Math.max(module.layout.h, 1)}`,
          }}
          type="button"
        >
          <span className="truncate font-medium">{module.title || module.id}</span>
          <span className="text-muted-foreground">{module.visualization.type} · {module.layout.w}x{module.layout.h}</span>
        </button>
      ))}
    </div>
  );
}

function PanelDatasetSheet({
  datasets,
  entityTypes,
  fieldErrors,
  filters,
  index,
  metrics,
  modules,
  onClose,
  open,
  setDatasets,
  setFilters,
  setMetrics,
  setModules,
  setNotice,
}: {
  datasets: PanelEditorDataset[];
  entityTypes: AppViewEntityTypeOption[];
  fieldErrors?: Record<string, string[]>;
  filters: PanelEditorFilter[];
  index: number | null;
  metrics: PanelEditorMetric[];
  modules: PanelEditorModule[];
  onClose: () => void;
  open: boolean;
  setDatasets: (value: PanelEditorDataset[]) => void;
  setFilters: (value: PanelEditorFilter[]) => void;
  setMetrics: (value: PanelEditorMetric[]) => void;
  setModules: (value: PanelEditorModule[]) => void;
  setNotice: (value: string) => void;
}) {
  const draftIndex = index ?? datasets.length;
  const initialDatasets = index === null
    ? [...datasets, defaultPanelDataset(entityTypes, datasets)]
    : datasets;
  const [draftDatasets, setDraftDatasets] = useState(() => clonePanelEditorValue(initialDatasets));
  const [draftFilters, setDraftFilters] = useState(() => clonePanelEditorValue(filters));
  const [draftMetrics, setDraftMetrics] = useState(() => clonePanelEditorValue(metrics));
  const [draftModules, setDraftModules] = useState(() => clonePanelEditorValue(modules));
  const [draftNotice, setDraftNotice] = useState("");
  const dirty = JSON.stringify({ draftDatasets, draftFilters, draftMetrics, draftModules }) !==
    JSON.stringify({ draftDatasets: initialDatasets, draftFilters: filters, draftMetrics: metrics, draftModules: modules });

  return (
    <PanelEditorSheet
      dirty={dirty}
      description="Configura entidad, transformación, relación, orden y campos disponibles."
      onClose={onClose}
      onSave={() => {
        setDatasets(clonePanelEditorValue(draftDatasets));
        setFilters(clonePanelEditorValue(draftFilters));
        setMetrics(clonePanelEditorValue(draftMetrics));
        setModules(clonePanelEditorValue(draftModules));
        if (draftNotice) {
          setNotice(draftNotice);
        }
        onClose();
      }}
      open={open}
      title={index === null ? "Agregar dataset" : "Editar dataset"}
    >
      {draftNotice ? (
        <p className="mb-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900" role="status">
          {draftNotice}
        </p>
      ) : null}
      {draftDatasets[draftIndex] ? (
        <PanelDatasetEditor
          dataset={draftDatasets[draftIndex]}
          datasets={draftDatasets}
          entityTypes={entityTypes}
          fieldErrors={fieldErrors}
          filters={draftFilters}
          index={draftIndex}
          metrics={draftMetrics}
          modules={draftModules}
          setDatasets={setDraftDatasets}
          setFilters={setDraftFilters}
          setMetrics={setDraftMetrics}
          setModules={setDraftModules}
          setNotice={setDraftNotice}
        />
      ) : null}
    </PanelEditorSheet>
  );
}

function PanelFilterSheet({
  datasets,
  entityTypes,
  filters,
  index,
  onClose,
  open,
  setFilters,
}: {
  datasets: PanelEditorDataset[];
  entityTypes: AppViewEntityTypeOption[];
  filters: PanelEditorFilter[];
  index: number | null;
  onClose: () => void;
  open: boolean;
  setFilters: (value: PanelEditorFilter[]) => void;
}) {
  const draftIndex = index ?? filters.length;
  const initialFilters = index === null ? [...filters, defaultPanelFilter(datasets, entityTypes, filters)] : filters;
  const [draftFilters, setDraftFilters] = useState(() => clonePanelEditorValue(initialFilters));
  const dirty = JSON.stringify(draftFilters) !== JSON.stringify(initialFilters);

  return (
    <PanelEditorSheet
      dirty={dirty}
      description="Define el nombre, campo y operador del filtro."
      onClose={onClose}
      onSave={() => {
        setFilters(clonePanelEditorValue(draftFilters));
        onClose();
      }}
      open={open}
      title={index === null ? "Agregar filtro" : "Editar filtro"}
    >
      {draftFilters[draftIndex] ? (
        <PanelFilterEditor
          datasets={datasets}
          entityTypes={entityTypes}
          filter={draftFilters[draftIndex]}
          filters={draftFilters}
          index={draftIndex}
          setFilters={setDraftFilters}
        />
      ) : null}
    </PanelEditorSheet>
  );
}

function PanelMetricSheet({
  datasets,
  entityTypes,
  filters,
  index,
  metrics,
  onClose,
  open,
  setMetrics,
}: {
  datasets: PanelEditorDataset[];
  entityTypes: AppViewEntityTypeOption[];
  filters: PanelEditorFilter[];
  index: number | null;
  metrics: PanelEditorMetric[];
  onClose: () => void;
  open: boolean;
  setMetrics: (value: PanelEditorMetric[]) => void;
}) {
  const draftIndex = index ?? metrics.length;
  const initialMetrics = index === null ? [...metrics, defaultPanelMetric(datasets, metrics)] : metrics;
  const [draftMetrics, setDraftMetrics] = useState(() => clonePanelEditorValue(initialMetrics));
  const dirty = JSON.stringify(draftMetrics) !== JSON.stringify(initialMetrics);

  return (
    <PanelEditorSheet
      dirty={dirty}
      description="Configura agregación, campo, filtros opcionales y condiciones fijas."
      onClose={onClose}
      onSave={() => {
        setMetrics(clonePanelEditorValue(draftMetrics));
        onClose();
      }}
      open={open}
      title={index === null ? "Agregar métrica" : "Editar métrica"}
    >
      {draftMetrics[draftIndex] ? (
        <PanelMetricEditor
          datasets={datasets}
          entityTypes={entityTypes}
          filters={filters}
          index={draftIndex}
          metric={draftMetrics[draftIndex]}
          metrics={draftMetrics}
          setMetrics={setDraftMetrics}
        />
      ) : null}
    </PanelEditorSheet>
  );
}

function PanelModuleSheet({
  datasets,
  entityTypes,
  fieldErrors,
  index,
  layoutColumns,
  metrics,
  modules,
  onClose,
  open,
  setModules,
}: {
  datasets: PanelEditorDataset[];
  entityTypes: AppViewEntityTypeOption[];
  fieldErrors?: Record<string, string[]>;
  index: number | null;
  layoutColumns: number;
  metrics: PanelEditorMetric[];
  modules: PanelEditorModule[];
  onClose: () => void;
  open: boolean;
  setModules: (value: PanelEditorModule[]) => void;
}) {
  const draftIndex = index ?? modules.length;
  const initialModules = index === null ? packPanelModules([...modules, defaultPanelModule(datasets, metrics, modules, layoutColumns)], layoutColumns) : modules;
  const [draftModules, setDraftModules] = useState(() => clonePanelEditorValue(initialModules));
  const dirty = JSON.stringify(draftModules) !== JSON.stringify(initialModules);
  const spatialModules = sortPanelModulesByLayout(draftModules);
  const draftModule = draftModules[draftIndex];
  const spatialIndex = draftModule ? spatialModules.findIndex((item) => item.id === draftModule.id) : 0;

  return (
    <PanelEditorSheet
      dirty={dirty}
      description="Configura tipo, dataset, columnas o KPI, y layout del módulo."
      onClose={onClose}
      onSave={() => {
        setModules(clonePanelEditorValue(draftModules));
        onClose();
      }}
      open={open}
      title={index === null ? "Agregar módulo" : "Editar módulo"}
    >
      {draftModule ? (
        <PanelModuleEditor
          datasets={datasets}
          entityTypes={entityTypes}
          fieldErrors={fieldErrors}
          index={draftIndex}
          layoutColumns={layoutColumns}
          metrics={metrics}
          module={draftModule}
          modules={draftModules}
          setModules={setDraftModules}
          spatialIndex={Math.max(0, spatialIndex)}
          spatialModules={spatialModules}
        />
      ) : null}
    </PanelEditorSheet>
  );
}

function panelEditorSections({
  activeSection,
  datasets,
  fieldErrors,
  filters,
  layoutOverlaps,
  metrics,
  modules,
}: {
  activeSection: PanelEditorSectionId;
  datasets: PanelEditorDataset[];
  fieldErrors?: Record<string, string[]>;
  filters: PanelEditorFilter[];
  layoutOverlaps: ReturnType<typeof panelModuleLayoutOverlaps>;
  metrics: PanelEditorMetric[];
  modules: PanelEditorModule[];
}) {
  const items: Array<{
    activeClassName: string;
    complete: boolean;
    countLabel: string;
    hasError: boolean;
    icon: typeof Database;
    id: PanelEditorSectionId;
    label: string;
  }> = [
    {
      activeClassName: "border-slate-200 bg-slate-50 text-slate-950",
      complete: true,
      countLabel: "Identidad",
      hasError: panelSectionHasErrors("datos-generales", fieldErrors),
      icon: Settings2,
      id: "datos-generales",
      label: "Datos generales",
    },
    {
      activeClassName: "border-sky-200 bg-sky-50 text-sky-950",
      complete: datasets.length > 0,
      countLabel: `${datasets.length} dataset${datasets.length === 1 ? "" : "s"}`,
      hasError: panelSectionHasErrors("fuentes-de-datos", fieldErrors),
      icon: Database,
      id: "fuentes-de-datos",
      label: "Fuentes de datos",
    },
    {
      activeClassName: "border-amber-200 bg-amber-50 text-amber-950",
      complete: true,
      countLabel: `${filters.length} filtro${filters.length === 1 ? "" : "s"}`,
      hasError: panelSectionHasErrors("filtros", fieldErrors),
      icon: Filter,
      id: "filtros",
      label: "Filtros",
    },
    {
      activeClassName: "border-emerald-200 bg-emerald-50 text-emerald-950",
      complete: true,
      countLabel: `${metrics.length} métrica${metrics.length === 1 ? "" : "s"}`,
      hasError: panelSectionHasErrors("metricas", fieldErrors),
      icon: BarChart3,
      id: "metricas",
      label: "Métricas",
    },
    {
      activeClassName: "border-violet-200 bg-violet-50 text-violet-950",
      complete: modules.length > 0,
      countLabel: `${modules.length} módulo${modules.length === 1 ? "" : "s"}`,
      hasError: panelSectionHasErrors("modulos", fieldErrors),
      icon: LayoutDashboard,
      id: "modulos",
      label: "Módulos",
    },
    {
      activeClassName: "border-slate-300 bg-slate-100 text-slate-950",
      complete: layoutOverlaps.length === 0,
      countLabel: layoutOverlaps.length > 0 ? `${layoutOverlaps.length} solapamiento${layoutOverlaps.length === 1 ? "" : "s"}` : "Layout válido",
      hasError: panelSectionHasErrors("diseno", fieldErrors) || layoutOverlaps.length > 0,
      icon: Grid3X3,
      id: "diseno",
      label: "Diseño",
    },
  ];

  return items.map((item) => ({ ...item, active: item.id === activeSection }));
}

function panelToneClassName(tone: "datasets" | "filters" | "general" | "layout" | "metrics" | "modules") {
  if (tone === "datasets") return "border-sky-200 bg-sky-50/70";
  if (tone === "filters") return "border-amber-200 bg-amber-50/70";
  if (tone === "metrics") return "border-emerald-200 bg-emerald-50/70";
  if (tone === "modules") return "border-violet-200 bg-violet-50/70";
  if (tone === "layout") return "border-slate-200 bg-slate-100/70";

  return "border-slate-200 bg-slate-50/70";
}

function panelBadgeClassName(tone: "datasets" | "filters" | "metrics" | "modules") {
  if (tone === "datasets") return "bg-sky-50 text-sky-900";
  if (tone === "filters") return "bg-amber-50 text-amber-900";
  if (tone === "metrics") return "bg-emerald-50 text-emerald-900";

  return "bg-violet-50 text-violet-900";
}

function defaultPanelDataset(entityTypes: AppViewEntityTypeOption[], datasets: PanelEditorDataset[]): PanelEditorDataset {
  const entityType = entityTypes[0];
  const fieldId = entityType?.fields.find((field) => field.isActive)?.id ?? "";

  return {
    id: nextPanelId("dataset", datasets.map((dataset) => dataset.id)),
    name: "Dataset",
    source: { type: "ENTITY", entityTypeId: entityType?.id ?? "" },
    transformation: {
      type: "RECORDS",
      fieldIds: fieldId ? [fieldId] : [],
      pagination: { pageSize: 25 },
    },
  };
}

function defaultPanelFilter(
  datasets: PanelEditorDataset[],
  entityTypes: AppViewEntityTypeOption[],
  filters: PanelEditorFilter[],
): PanelEditorFilter {
  const dataset = datasets[0];
  const entityType = entityTypes.find((item) => item.id === dataset?.source.entityTypeId) ?? entityTypes[0];
  const field = entityType?.fields.find((item) => item.isActive);

  return {
    id: nextPanelId("filter", filters.map((filter) => filter.id)),
    label: "Filtro",
    valueType: panelValueTypeForField(field),
    fieldId: field?.id ?? "",
    operator: "EQ",
  };
}

function defaultPanelMetric(datasets: PanelEditorDataset[], metrics: PanelEditorMetric[]): PanelEditorMetric {
  const dataset = datasets[0];

  return {
    id: nextPanelId("metric", metrics.map((metric) => metric.id)),
    name: "Total de registros",
    datasetId: dataset?.id ?? "",
    aggregation: "COUNT",
    fieldId: null,
    filterIds: [],
    conditions: [],
  };
}

function defaultPanelModule(
  datasets: PanelEditorDataset[],
  metrics: PanelEditorMetric[],
  modules: PanelEditorModule[],
  layoutColumns: number,
): PanelEditorModule {
  const dataset = datasets[0];
  const metric = metrics[0];
  const id = nextPanelId("table", modules.map((module) => module.id));

  if (metric) {
    return {
      id: nextPanelId("kpi", modules.map((module) => module.id)),
      title: "Indicador",
      datasetId: metric.datasetId || dataset?.id || "",
      visualization: {
        type: "KPI",
        config: {
          metricId: metric.id,
          label: metric.name || "Indicador",
          format: "NUMBER",
        },
      },
      layout: { x: 0, y: modules.length, w: Math.min(4, layoutColumns), h: 2 },
    };
  }

  return {
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
  };
}

export function clonePanelEditorValue<T>(value: T): T {
  return structuredClone(value);
}

export function removePanelDatasetAt(
  state: {
    datasets: PanelEditorDataset[];
    filters: PanelEditorFilter[];
    metrics: PanelEditorMetric[];
    modules: PanelEditorModule[];
  },
  index: number,
) {
  const datasets = state.datasets.filter((_, itemIndex) => itemIndex !== index);
  const datasetIds = new Set(datasets.map((dataset) => dataset.id));
  const metrics = state.metrics
    .filter((metric) => datasetIds.has(metric.datasetId))
    .map((metric) => cleanPanelMetricForDataset(
      metric,
      datasets.find((dataset) => dataset.id === metric.datasetId),
    ));
  const metricIds = new Set(metrics.map((metric) => metric.id));
  const modules = state.modules
    .filter((module) => datasetIds.has(module.datasetId))
    .filter((module) => module.visualization.type !== "KPI" || metricIds.has(module.visualization.config.metricId))
    .map((module) => ({
      ...module,
      visualization: cleanPanelModuleVisualizationForDataset(
        module.visualization,
        datasets.find((dataset) => dataset.id === module.datasetId),
        metrics,
      ),
    }));

  return {
    datasets,
    filters: datasets.length === 0 ? [] : state.filters,
    metrics,
    modules,
  };
}

export function removePanelFilterAt(
  state: {
    filters: PanelEditorFilter[];
    metrics: PanelEditorMetric[];
  },
  index: number,
) {
  const filter = state.filters[index];

  if (!filter) {
    return state;
  }

  return {
    filters: state.filters.filter((_, itemIndex) => itemIndex !== index),
    metrics: state.metrics.map((metric) => ({
      ...metric,
      filterIds: metric.filterIds.filter((filterId) => filterId !== filter.id),
    })),
  };
}

export function removePanelMetricAt(
  state: {
    metrics: PanelEditorMetric[];
    modules: PanelEditorModule[];
  },
  index: number,
) {
  const metric = state.metrics[index];

  if (!metric) {
    return state;
  }

  return {
    metrics: state.metrics.filter((_, itemIndex) => itemIndex !== index),
    modules: state.modules.filter((module) =>
      module.visualization.type !== "KPI" || module.visualization.config.metricId !== metric.id,
    ),
  };
}

export function removePanelModuleAt(modules: PanelEditorModule[], index: number) {
  return modules.filter((_, itemIndex) => itemIndex !== index);
}

function panelMetricReadableSummary(
  metric: PanelEditorMetric,
  dataset: PanelEditorDataset | undefined,
  field: AppViewEntityTypeOption["fields"][number] | undefined,
  fields: AppViewEntityTypeOption["fields"],
) {
  const aggregation = panelMetricAggregationOptions().find((option) => option.value === metric.aggregation)?.label ?? metric.aggregation;
  const target = field?.name ?? (metric.aggregation === "COUNT" ? "registros" : "campo sin seleccionar");
  const conditions = metric.conditions ?? [];

  if (conditions.length === 0) {
    return `${aggregation} ${target} en ${dataset?.name || dataset?.id || "dataset sin seleccionar"}.`;
  }

  return `${aggregation} ${target} donde ${conditions
    .map((condition) => panelMetricConditionSummary(condition, fields.find((item) => item.id === condition.fieldId)))
    .join(" y ")}.`;
}

function PanelDatasetEditor({
  dataset,
  datasets,
  entityTypes,
  fieldErrors,
  filters,
  index,
  metrics,
  modules,
  setDatasets,
  setFilters,
  setMetrics,
  setModules,
  setNotice,
}: {
  dataset: PanelEditorDataset;
  datasets: PanelEditorDataset[];
  entityTypes: AppViewEntityTypeOption[];
  fieldErrors?: Record<string, string[]>;
  filters: PanelEditorFilter[];
  index: number;
  metrics: PanelEditorMetric[];
  modules: PanelEditorModule[];
  setDatasets: (value: PanelEditorDataset[]) => void;
  setFilters: (value: PanelEditorFilter[]) => void;
  setMetrics: (value: PanelEditorMetric[]) => void;
  setModules: (value: PanelEditorModule[]) => void;
  setNotice: (value: string) => void;
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
          helpText="Entidad que contiene los registros históricos o transaccionales."
          label="Entidad con el historial o movimientos"
          name={`panelDatasetEntity:${dataset.id}`}
          onChange={(entityTypeId) => {
            const nextEntity = entityTypes.find((item) => item.id === entityTypeId);
            const nextDataset = cleanPanelDatasetForEntity({
              ...dataset,
              source: { type: "ENTITY", entityTypeId },
            }, nextEntity, entityTypes);
            const nextDatasets = replaceAt(datasets, index, nextDataset);

            setDatasets(nextDatasets);
            setFilters(cleanPanelFiltersForEntity(filters, nextEntity));
            setMetrics(cleanPanelMetricsForDatasets(metrics, nextDatasets));
            setModules(cleanPanelModulesForDatasets(modules, nextDatasets));
            setNotice("Actualizamos los campos porque cambiaste la entidad.");
          }}
          options={entityTypes}
          value={dataset.source.entityTypeId}
        />
        <SelectControl
          label="Transformación"
          name={`panelDatasetTransformation:${dataset.id}`}
          onChange={(value) => {
            const nextDataset: PanelEditorDataset = {
              ...dataset,
              transformation: value === "LATEST_BY_RELATION"
                ? {
                    type: "LATEST_BY_RELATION",
                    relatedEntityTypeId: relationTargetEntityTypeIds(entityType)[0] ?? "",
                    relationFieldId: "",
                    orderFieldId: "",
                    requiredValueFieldId: undefined,
                    fieldIds: transformation.fieldIds,
                    pagination: transformation.pagination,
                  }
                : {
                    type: "RECORDS",
                    fieldIds: transformation.fieldIds,
                    pagination: transformation.pagination,
                  },
            };
            const nextDatasets = replaceAt(datasets, index, nextDataset);

            setDatasets(nextDatasets);
            setMetrics(cleanPanelMetricsForDatasets(metrics, nextDatasets));
            setModules(cleanPanelModulesForDatasets(modules, nextDatasets));
          }}
          options={[
            { label: "Registros", value: "RECORDS" },
            { label: "Último registro por relación", value: "LATEST_BY_RELATION" },
          ]}
          value={transformation.type}
        />
      </div>
      {transformation.type === "LATEST_BY_RELATION" ? (
        <div className="grid gap-3">
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
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            <FieldSelect
              allowedTypes={["RELATION"]}
              disabled={!transformation.relatedEntityTypeId}
              fields={relationFieldsTargeting(entityType, transformation.relatedEntityTypeId)}
              helpText="Campo que identifica el elemento del cual se mostrará el último registro."
              label="Campo que relaciona cada movimiento"
              name={`panelDatasetRelation:${dataset.id}`}
              onChange={(relationFieldId) => updateDataset({ ...dataset, transformation: { ...transformation, relationFieldId } })}
              preferredType="RELATION"
              value={transformation.relationFieldId}
              errors={fieldErrors?.panelDatasetRelation}
            />
            <FieldSelect
              disabled={!transformation.relationFieldId}
              fields={activeFields.filter((field) => reportSortableFieldTypes.has(field.type))}
              helpText="Campo usado para determinar cuál registro es el más reciente."
              label="Campo que determina cuál es el último"
              name={`panelDatasetOrder:${dataset.id}`}
              onChange={(orderFieldId) => updateDataset({ ...dataset, transformation: { ...transformation, orderFieldId } })}
              preferredType="DATE"
              value={transformation.orderFieldId}
              errors={fieldErrors?.panelDatasetOrder}
            />
            <FieldSelect
              disabled={!transformation.orderFieldId}
              fields={activeFields}
              includeEmpty
              label="Campo que debe tener valor, opcional"
              name={`panelDatasetRequired:${dataset.id}`}
              onChange={(requiredValueFieldId) => updateDataset({
                ...dataset,
                transformation: { ...transformation, requiredValueFieldId: requiredValueFieldId || undefined },
              })}
              preferredType="SELECT"
              value={transformation.requiredValueFieldId ?? ""}
            />
          </div>
        </div>
      ) : null}
      <OrderedFieldChecklist
        fields={activeFields}
        label="Campos disponibles para mostrar"
        name={`panelDatasetFields:${dataset.id}`}
        selected={transformation.fieldIds}
        setSelected={(fieldIds) => updateDataset({ ...dataset, transformation: { ...transformation, fieldIds } })}
      />
      <FieldError errors={fieldErrors?.panelDatasetFields} />
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

function PanelMetricEditor({
  datasets,
  entityTypes,
  filters,
  index,
  metric,
  metrics,
  setMetrics,
}: {
  datasets: PanelEditorDataset[];
  entityTypes: AppViewEntityTypeOption[];
  filters: PanelEditorFilter[];
  index: number;
  metric: PanelEditorMetric;
  metrics: PanelEditorMetric[];
  setMetrics: (value: PanelEditorMetric[]) => void;
}) {
  const dataset = datasets.find((item) => item.id === metric.datasetId);
  const fields = fieldsForPanelDataset(dataset, entityTypes);
  const compatibleFields = fields.filter((field) => panelMetricAggregationTargetsField(metric.aggregation, field.type));
  const conditionFields = fields.filter((field) => panelMetricConditionTargetsField(field.type));
  const availableFilterIds = new Set(dataset?.filters
    ?.filter((filter) => filter.type === "PANEL_FILTER")
    .map((filter) => filter.filterId) ?? []);
  const applicableFilters = filters.filter((filter) => availableFilterIds.has(filter.id));
  const updateMetric = (next: PanelEditorMetric) => setMetrics(replaceAt(metrics, index, next));
  const conditions = metric.conditions ?? [];
  const addCondition = () => {
    const field = conditionFields[0];

    if (!field) {
      return;
    }

    updateMetric({
      ...metric,
      conditions: [
        ...conditions,
        cleanPanelMetricConditionForField({
          fieldId: field.id,
          operator: "EQUALS",
          value: defaultPanelMetricConditionValue(field),
        }, field),
      ],
    });
  };

  return (
    <div className="grid gap-3 rounded-md border border-border p-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <TextControl label="Nombre visible" onChange={(name) => updateMetric({ ...metric, name })} value={metric.name} />
        <TextControl label="Identificador interno" onChange={(id) => updateMetric({ ...metric, id })} value={metric.id} />
        <SelectControl
          label="Dataset"
          name={`panelMetricDataset:${metric.id}`}
          onChange={(datasetId) => updateMetric(cleanPanelMetricForDataset({
            ...metric,
            datasetId,
          }, datasets.find((item) => item.id === datasetId)))}
          options={[{ label: "Selecciona un dataset", value: "" }, ...datasets.map((item) => ({ label: item.name || item.id, value: item.id }))]}
          value={metric.datasetId}
        />
        <SelectControl
          label="Operación"
          name={`panelMetricAggregation:${metric.id}`}
          onChange={(aggregation) => updateMetric(cleanPanelMetricForAggregation({
            ...metric,
            aggregation: aggregation as PanelMetricAggregation,
          }, fields))}
          options={panelMetricAggregationOptions()}
          value={metric.aggregation}
        />
      </div>
      {metric.aggregation !== "COUNT" ? (
        <FieldSelect
          fields={compatibleFields}
          label="Campo"
          name={`panelMetricField:${metric.id}`}
          onChange={(fieldId) => updateMetric({ ...metric, fieldId })}
          preferredType="INTEGER"
          value={metric.fieldId ?? ""}
        />
      ) : null}
      {applicableFilters.length > 0 ? (
        <fieldset className="grid gap-2 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">Filtros aplicables</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {applicableFilters.map((filter) => (
              <label className="flex items-center gap-2 text-sm" key={filter.id}>
                <input
                  checked={metric.filterIds.includes(filter.id)}
                  className="h-4 w-4"
                  onChange={(event) => {
                    const nextFilterIds = event.target.checked
                      ? [...metric.filterIds, filter.id]
                      : metric.filterIds.filter((filterId) => filterId !== filter.id);

                    updateMetric({ ...metric, filterIds: nextFilterIds });
                  }}
                  type="checkbox"
                />
                {filter.label || filter.id}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <fieldset className="grid gap-3 rounded-md border border-border p-3">
        <div className="flex items-center justify-between gap-3">
          <legend className="px-1 text-sm font-medium">Condiciones</legend>
          <button className="rounded border border-input px-3 py-1 text-sm disabled:opacity-40" disabled={conditionFields.length === 0} onClick={addCondition} type="button">
            Agregar condición
          </button>
        </div>
        {conditions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin condiciones específicas.</p>
        ) : (
          <div className="grid gap-3">
            {conditions.map((condition, conditionIndex) => {
              const field = conditionFields.find((item) => item.id === condition.fieldId) ?? conditionFields[0];
              const operatorOptions = panelMetricConditionOperatorOptions(field);
              const conditionWithValidField = field && condition.fieldId !== field.id
                ? cleanPanelMetricConditionForField({ ...condition, fieldId: field.id }, field)
                : condition;

              return (
                <div className="grid gap-3 rounded border border-border p-3" key={`${condition.fieldId}:${conditionIndex}`}>
                  <p className="text-xs text-muted-foreground">{panelMetricConditionSummary(conditionWithValidField, field)}</p>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(160px,220px)_minmax(0,1fr)_auto]">
                    <SelectControl
                      label="Campo"
                      name={`panelMetricConditionField:${metric.id}:${conditionIndex}`}
                      onChange={(fieldId) => {
                        const nextField = conditionFields.find((item) => item.id === fieldId);
                        if (!nextField) return;
                        updateMetric({
                          ...metric,
                          conditions: replaceAt(conditions, conditionIndex, cleanPanelMetricConditionForField({
                            ...condition,
                            fieldId,
                          }, nextField)),
                        });
                      }}
                      options={conditionFields.map((item) => ({ label: item.name, value: item.id }))}
                      value={field?.id ?? ""}
                    />
                    <SelectControl
                      label="Operador"
                      name={`panelMetricConditionOperator:${metric.id}:${conditionIndex}`}
                      onChange={(operator) => {
                        if (!field) return;
                        updateMetric({
                          ...metric,
                          conditions: replaceAt(conditions, conditionIndex, cleanPanelMetricConditionForField({
                            ...conditionWithValidField,
                            operator: operator as PanelMetricConditionOperator,
                          }, field)),
                        });
                      }}
                      options={operatorOptions}
                      value={operatorOptions.some((option) => option.value === conditionWithValidField.operator) ? conditionWithValidField.operator : operatorOptions[0]?.value ?? "EQUALS"}
                    />
                    <PanelMetricConditionValueControl
                      condition={conditionWithValidField}
                      field={field}
                      metricId={metric.id}
                      onChange={(nextCondition) => updateMetric({
                        ...metric,
                        conditions: replaceAt(conditions, conditionIndex, nextCondition),
                      })}
                      index={conditionIndex}
                    />
                    <div className="flex items-end gap-2">
                      <button aria-label="Subir condición" className="rounded border border-input px-2 py-1 text-sm disabled:opacity-40" disabled={conditionIndex === 0} onClick={() => updateMetric({ ...metric, conditions: moveAt(conditions, conditionIndex, -1) })} type="button">
                        Subir
                      </button>
                      <button aria-label="Bajar condición" className="rounded border border-input px-2 py-1 text-sm disabled:opacity-40" disabled={conditionIndex === conditions.length - 1} onClick={() => updateMetric({ ...metric, conditions: moveAt(conditions, conditionIndex, 1) })} type="button">
                        Bajar
                      </button>
                      <button className="rounded border border-input px-2 py-1 text-sm" onClick={() => updateMetric({ ...metric, conditions: conditions.filter((_, itemIndex) => itemIndex !== conditionIndex) })} type="button">
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </fieldset>
      <div className="flex justify-end">
        <button className="rounded border border-input px-3 py-1 text-sm" onClick={() => setMetrics(metrics.filter((_, itemIndex) => itemIndex !== index))} type="button">
          Eliminar
        </button>
      </div>
    </div>
  );
}

function PanelMetricConditionValueControl({
  condition,
  field,
  index,
  metricId,
  onChange,
}: {
  condition: PanelMetricCondition;
  field: AppViewEntityTypeOption["fields"][number] | undefined;
  index: number;
  metricId: string;
  onChange: (condition: PanelMetricCondition) => void;
}) {
  if (!field || condition.operator === "IS_EMPTY" || condition.operator === "IS_NOT_EMPTY") {
    return <div className="text-sm text-muted-foreground">Sin valor</div>;
  }

  const isMultiValue = condition.operator === "IN" || condition.operator === "NOT_IN";
  const values = isMultiValue
    ? condition.values ?? []
    : condition.value
      ? [condition.value]
      : [];
  const updateValues = (nextValues: PanelMetricConditionValue[]) => {
    onChange(isMultiValue
      ? { ...condition, values: nextValues, value: undefined }
      : { ...condition, value: nextValues[0], values: undefined });
  };
  const firstValue = values[0] ?? defaultPanelMetricConditionValue(field);

  if (field.type === "SELECT" || field.type === "MULTISELECT") {
    const selectedOptionIds = values
      .filter((value): value is Extract<PanelMetricConditionValue, { type: "OPTION" }> => value.type === "OPTION")
      .map((value) => value.optionId);

    return (
      <label className="grid gap-2 text-sm font-medium">
        Valor
        <select
          className="min-h-10 rounded-md border border-input bg-background px-3 py-2 text-sm font-normal outline-none ring-ring focus-visible:ring-2"
          multiple={isMultiValue}
          name={`panelMetricConditionValue:${metricId}:${index}`}
          onChange={(event) => {
            const optionIds = Array.from(event.target.selectedOptions).map((option) => option.value).filter(Boolean);
            updateValues(optionIds.map((optionId) => ({ type: "OPTION", optionId })));
          }}
          value={isMultiValue ? selectedOptionIds : selectedOptionIds[0] ?? ""}
        >
          {!isMultiValue ? <option value="">Selecciona una opción</option> : null}
          {field.options.filter((option) => option.isActive).map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "BOOLEAN") {
    return (
      <SelectControl
        label="Valor"
        name={`panelMetricConditionValue:${metricId}:${index}`}
        onChange={(value) => updateValues([{ type: "BOOLEAN", value: value === "true" }])}
        options={[
          { label: "Sí", value: "true" },
          { label: "No", value: "false" },
        ]}
        value={firstValue.type === "BOOLEAN" ? String(firstValue.value) : "true"}
      />
    );
  }

  const valueType = panelMetricConditionValueTypeForField(field);
  const inputType = valueType === "NUMBER" ? "number" : valueType === "DATE" ? "date" : valueType === "DATETIME" ? "datetime-local" : "text";
  const inputValue = panelMetricConditionInputValue(firstValue, valueType);

  return (
    <label className="grid gap-2 text-sm font-medium">
      Valor
      <input
        className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none ring-ring focus-visible:ring-2"
        name={`panelMetricConditionValue:${metricId}:${index}`}
        onChange={(event) => updateValues([panelMetricConditionValueFromInput(event.target.value, valueType)])}
        step={valueType === "NUMBER" ? "any" : undefined}
        type={inputType}
        value={inputValue}
      />
    </label>
  );
}

function PanelModuleEditor({
  datasets,
  entityTypes,
  index,
  layoutColumns,
  metrics,
  module,
  modules,
  fieldErrors,
  setModules,
  spatialIndex,
  spatialModules,
}: {
  datasets: PanelEditorDataset[];
  entityTypes: AppViewEntityTypeOption[];
  index: number;
  layoutColumns: number;
  metrics: PanelEditorMetric[];
  module: PanelEditorModule;
  modules: PanelEditorModule[];
  fieldErrors?: Record<string, string[]>;
  setModules: (value: PanelEditorModule[]) => void;
  spatialIndex: number;
  spatialModules: PanelEditorModule[];
}) {
  const dataset = datasets.find((item) => item.id === module.datasetId);
  const datasetFieldIds = dataset?.transformation.fieldIds ?? [];
  const entityType = entityTypes.find((item) => item.id === dataset?.source.entityTypeId);
  const fieldsById = new Map((entityType?.fields ?? []).map((field) => [field.id, field]));
  const fieldSourcesById = panelFieldSourcesById(entityTypes);
  const datasetFields = datasetFieldIds
    .map((fieldId) => fieldsById.get(fieldId))
    .filter((field): field is AppViewEntityTypeOption["fields"][number] => Boolean(field));
  const columns = module.visualization.type === "TABLE" ? module.visualization.config.columns : [];
  const incompatibleColumns = incompatiblePanelColumns(module, datasets);
  const updateModule = (next: PanelEditorModule) => setModules(replaceAt(modules, index, next));
  const moveModuleSpatially = (direction: -1 | 1) => {
    setModules(packPanelModules(moveAt(spatialModules, spatialIndex, direction), layoutColumns));
  };
  const updateColumns = (nextColumns: PanelTableColumns) => updateModule({
    ...module,
    visualization: {
      type: "TABLE",
      config: { ...module.visualization.config, columns: nextColumns },
    },
  });
  const kpiVisualization = module.visualization.type === "KPI" ? module.visualization : null;
  const moduleDatasetMetrics = metrics.filter((metric) => metric.datasetId === module.datasetId);

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
            visualization: cleanPanelModuleVisualizationForDataset(module.visualization, datasets.find((item) => item.id === datasetId), metrics),
          })}
          options={[{ label: "Selecciona un dataset", value: "" }, ...datasets.map((item) => ({ label: item.name || item.id, value: item.id }))]}
          value={module.datasetId}
        />
        <SelectControl
          label="Tipo"
          name={`panelModuleType:${module.id}`}
          onChange={(type) => updateModule({
            ...module,
            visualization: type === "KPI"
              ? {
                  type: "KPI",
                  config: {
                    metricId: moduleDatasetMetrics[0]?.id ?? "",
                    label: moduleDatasetMetrics[0]?.name ?? module.title ?? "Indicador",
                    format: "NUMBER",
                  },
                }
              : {
                  type: "TABLE",
                  config: {
                    columns: [],
                    searchable: true,
                    paginated: true,
                  },
                },
          })}
          options={[
            { label: "Tabla", value: "TABLE" },
            { label: "KPI", value: "KPI" },
          ]}
          value={module.visualization.type}
        />
      </div>
      {kpiVisualization ? (
        <fieldset className="grid gap-2 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">Indicador</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectControl
              label="Métrica"
              name={`panelKpiMetric:${module.id}`}
              onChange={(metricId) => {
                const metric = moduleDatasetMetrics.find((item) => item.id === metricId);

                updateModule({
                  ...module,
                  visualization: {
                    type: "KPI",
                    config: {
                      ...kpiVisualization.config,
                      metricId,
                      label: metric?.name ?? kpiVisualization.config.label,
                    },
                  },
                });
              }}
              options={[{ label: "Selecciona una métrica", value: "" }, ...moduleDatasetMetrics.map((metric) => ({ label: metric.name || metric.id, value: metric.id }))]}
              value={moduleDatasetMetrics.some((metric) => metric.id === kpiVisualization.config.metricId) ? kpiVisualization.config.metricId : ""}
            />
            <TextControl
              label="Etiqueta"
              onChange={(label) => updateModule({
                ...module,
                visualization: {
                  type: "KPI",
                  config: { ...kpiVisualization.config, label },
                },
              })}
              value={kpiVisualization.config.label}
            />
            <SelectControl
              label="Formato"
              name={`panelKpiFormat:${module.id}`}
              onChange={(format) => updateModule({
                ...module,
                visualization: {
                  type: "KPI",
                  config: cleanPanelKpiConfigForFormat(kpiVisualization.config, format as PanelKpiFormat),
                },
              })}
              options={panelKpiFormatOptions()}
              value={kpiVisualization.config.format}
            />
            {kpiVisualization.config.format === "MONEY" ? (
              <SelectControl
                label="Moneda"
                name={`panelKpiCurrency:${module.id}`}
                onChange={(currencyCode) => updateModule({
                  ...module,
                  visualization: {
                    type: "KPI",
                    config: {
                      metricId: kpiVisualization.config.metricId,
                      label: kpiVisualization.config.label,
                      format: "MONEY",
                      currencyCode,
                    },
                  },
                })}
                options={panelCurrencyCodeOptions()}
                value={kpiVisualization.config.currencyCode}
              />
            ) : null}
            {kpiVisualization.config.format === "PERCENT" ? (
              <SelectControl
                label="Escala del porcentaje"
                name={`panelKpiPercentScale:${module.id}`}
                onChange={(percentScale) => updateModule({
                  ...module,
                  visualization: {
                    type: "KPI",
                    config: {
                      metricId: kpiVisualization.config.metricId,
                      label: kpiVisualization.config.label,
                      format: "PERCENT",
                      percentScale: percentScale as PanelPercentScale,
                    },
                  },
                })}
                options={panelPercentScaleOptions()}
                value={kpiVisualization.config.percentScale}
              />
            ) : null}
          </div>
          <FieldError errors={fieldErrors?.panelKpiMetric} />
        </fieldset>
      ) : (
      <fieldset className="grid gap-2 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">Columnas y diseño</legend>
        {incompatibleColumns.length > 0 ? (
          <div className="grid gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
            {incompatibleColumns.map((column) => {
              const source = fieldSourcesById.get(column.fieldId);
              const columnName = source?.field.name ?? column.fieldId;
              const datasetName = entityType?.name ?? dataset?.name ?? module.datasetId;

              return (
                <p className="text-destructive" key={column.fieldId}>
                  La columna {columnName} no pertenece al dataset {datasetName}.
                </p>
              );
            })}
            <div>
              <button
                className="rounded border border-input bg-background px-3 py-1 text-sm"
                onClick={() => updateColumns(columns.filter((column) => datasetFieldIds.includes(column.fieldId)))}
                type="button"
              >
                Quitar columnas incompatibles
              </button>
            </div>
          </div>
        ) : null}
        <FieldError errors={fieldErrors?.panelModuleColumns} />
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
                    {fieldSourcesById.get(field.id)?.entity.name ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {fieldSourcesById.get(field.id)?.entity.name}
                      </span>
                    ) : null}
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
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberControl label="Ancho" max={layoutColumns} min={1} onChange={(w) => updateModule({ ...module, layout: { ...module.layout, w } })} value={module.layout.w} />
        <NumberControl label="Orden" max={99} min={0} onChange={(y) => updateModule({ ...module, layout: { ...module.layout, y } })} value={module.layout.y} />
      </div>
      <div className="flex justify-end gap-2">
        <button aria-label={`Subir módulo ${module.title || module.id}`} className="rounded border border-input px-3 py-1 text-sm disabled:opacity-40" disabled={spatialIndex === 0} onClick={() => moveModuleSpatially(-1)} type="button">
          Subir
        </button>
        <button aria-label={`Bajar módulo ${module.title || module.id}`} className="rounded border border-input px-3 py-1 text-sm disabled:opacity-40" disabled={spatialIndex === spatialModules.length - 1} onClick={() => moveModuleSpatially(1)} type="button">
          Bajar
        </button>
        <button className="rounded border border-input px-3 py-1 text-sm" onClick={() => setModules(modules.filter((_, itemIndex) => itemIndex !== index))} type="button">
          Eliminar
        </button>
      </div>
    </div>
  );
}

function PanelPreview({
  datasets,
  entityTypes,
  layoutColumns,
  layoutRowHeight,
  metrics,
  modules,
  onToggle,
}: {
  datasets: PanelEditorDataset[];
  entityTypes: AppViewEntityTypeOption[];
  layoutColumns: number;
  layoutRowHeight: number;
  metrics: PanelEditorMetric[];
  modules: PanelEditorModule[];
  onToggle?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [referenceSize, setReferenceSize] = useState<"desktop" | "mobile">("desktop");

  return (
    <aside className="min-w-0 lg:col-span-2 2xl:col-span-1" id="vista-previa-panel">
      <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50/80 p-3 shadow-sm 2xl:sticky 2xl:top-4 2xl:max-h-[calc(100vh-2rem)] 2xl:overflow-auto">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">Vista previa</h3>
            <p className="text-xs text-muted-foreground">Grilla de {layoutColumns} columnas · valores de ejemplo</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            <Button onClick={() => setExpanded(true)} size="sm" type="button" variant="outline">
              <Maximize2 className="h-4 w-4" />
              Ampliar vista previa
            </Button>
            {onToggle ? (
              <Button aria-label="Contraer vista previa" onClick={onToggle} size="icon" type="button" variant="ghost">
                <EyeOff className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
        <PanelPreviewCanvas
          datasets={datasets}
          entityTypes={entityTypes}
          layoutColumns={layoutColumns}
          layoutRowHeight={layoutRowHeight}
          metrics={metrics}
          modules={modules}
          referenceSize="desktop"
        />
        <Sheet open={expanded} onOpenChange={setExpanded}>
          <SheetContent className="sm:max-w-[min(1120px,calc(100vw-2rem))]">
            <SheetHeader>
              <SheetTitle>Vista previa ampliada</SheetTitle>
              <SheetDescription>Representación estructural con datos de ejemplo. No modifica la configuración del panel.</SheetDescription>
            </SheetHeader>
            <div className="grid min-h-0 flex-1 gap-4 overflow-auto bg-slate-50/70 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Tamaño de referencia</p>
                <div className="flex rounded-md border border-border bg-background p-1" data-preview-reference={referenceSize}>
                  <Button
                    aria-pressed={referenceSize === "desktop"}
                    onClick={() => setReferenceSize("desktop")}
                    size="sm"
                    type="button"
                    variant={referenceSize === "desktop" ? "default" : "ghost"}
                  >
                    <Monitor className="h-4 w-4" />
                    Escritorio
                  </Button>
                  <Button
                    aria-pressed={referenceSize === "mobile"}
                    onClick={() => setReferenceSize("mobile")}
                    size="sm"
                    type="button"
                    variant={referenceSize === "mobile" ? "default" : "ghost"}
                  >
                    <Smartphone className="h-4 w-4" />
                    Móvil
                  </Button>
                </div>
              </div>
              <div className={cn("mx-auto w-full", referenceSize === "mobile" ? "max-w-[390px]" : "max-w-[1040px]")}>
                <PanelPreviewCanvas
                  datasets={datasets}
                  entityTypes={entityTypes}
                  layoutColumns={layoutColumns}
                  layoutRowHeight={layoutRowHeight}
                  metrics={metrics}
                  modules={modules}
                  referenceSize={referenceSize}
                />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </aside>
  );
}

function PanelPreviewCanvas({
  datasets,
  entityTypes,
  layoutColumns,
  layoutRowHeight,
  metrics,
  modules,
  referenceSize,
}: {
  datasets: PanelEditorDataset[];
  entityTypes: AppViewEntityTypeOption[];
  layoutColumns: number;
  layoutRowHeight: number;
  metrics: PanelEditorMetric[];
  modules: PanelEditorModule[];
  referenceSize: "desktop" | "mobile";
}) {
  const fieldSourcesById = panelFieldSourcesById(entityTypes);
  const layoutOverlaps = panelModuleLayoutOverlaps(modules);
  const overlapWarningsByModuleId = panelOverlapWarningsByModuleId(layoutOverlaps);
  const columns = referenceSize === "mobile" ? Math.min(4, Math.max(layoutColumns, 1)) : Math.max(layoutColumns, 1);

  return (
    <div
      className="grid min-w-0 gap-2 overflow-x-auto rounded-md border border-dashed border-slate-300 bg-white/80 p-2"
      data-panel-preview-canvas="true"
      data-preview-size={referenceSize}
      style={{
        gridAutoRows: `${Math.max(layoutRowHeight * (referenceSize === "mobile" ? 3 : 4), 32)}px`,
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      }}
    >
      {modules.length === 0 ? (
        <p className="col-span-full text-sm text-muted-foreground">No hay módulos configurados.</p>
      ) : sortPanelModulesByLayout(modules).map((module) => {
        const dataset = datasets.find((item) => item.id === module.datasetId);
        const datasetName = dataset?.name || dataset?.id || "sin dataset";
        const entityType = entityTypes.find((item) => item.id === dataset?.source.entityTypeId);
        const warnings = incompatiblePanelColumns(module, datasets);
        const overlapWarnings = overlapWarningsByModuleId.get(module.id) ?? [];
        const metricId = module.visualization.type === "KPI" ? module.visualization.config.metricId : "";
        const metric = metricId ? metrics.find((item) => item.id === metricId) : undefined;
        const span = referenceSize === "mobile" ? columns : Math.min(Math.max(module.layout.w, 1), columns);

        return (
          <article
            className={cn(
              "grid min-w-0 content-start gap-3 overflow-hidden rounded-md border bg-background p-3 text-sm shadow-sm",
              overlapWarnings.length > 0 ? "border-destructive/60" : "border-slate-200",
            )}
            key={module.id}
            style={{
              gridColumn: referenceSize === "mobile"
                ? `1 / span ${columns}`
                : `${Math.max(module.layout.x, 0) + 1} / span ${span}`,
              gridRow: referenceSize === "mobile"
                ? undefined
                : `${Math.max(module.layout.y, 0) + 1} / span ${Math.max(module.layout.h, 1)}`,
            }}
          >
            <div className="min-w-0">
              <p className="truncate font-medium" title={module.title || module.id}>{module.title || module.id}</p>
              <p className="truncate text-xs text-muted-foreground" title={datasetName}>
                {datasetName} · {module.visualization.type}
              </p>
              <p className="text-[11px] text-muted-foreground">x{module.layout.x} y{module.layout.y} · {module.layout.w}x{module.layout.h}</p>
              {entityType ? <p className="truncate text-xs text-muted-foreground" title={entityType.name}>{entityType.name}</p> : null}
            </div>
            {module.visualization.type === "KPI" ? (
              <PanelPreviewKpi config={module.visualization.config} metric={metric} />
            ) : (
              <PanelPreviewTable
                columns={module.visualization.config.columns}
                fieldSourcesById={fieldSourcesById}
                searchable={module.visualization.config.searchable}
              />
            )}
            <PanelPreviewWarnings
              datasetName={entityType?.name ?? datasetName}
              fieldSourcesById={fieldSourcesById}
              overlapWarnings={overlapWarnings}
              warnings={warnings}
            />
          </article>
        );
      })}
    </div>
  );
}

function PanelPreviewKpi({
  config,
  metric,
}: {
  config: PanelKpiConfig;
  metric?: PanelEditorMetric;
}) {
  const label = config.label || metric?.name || "Métrica sin seleccionar";
  const value = panelKpiPreviewValue(config);
  const updatedAt = "Actualizado 12-09-2026 09:30 (ejemplo)";

  return (
    <div className="grid min-w-0 gap-2 rounded-md border border-emerald-100 bg-emerald-50/40 p-3">
      <p className="truncate text-xs font-medium text-emerald-900" title={label} aria-label={label}>{label}</p>
      <p className="truncate text-3xl font-semibold tracking-normal" title={value} aria-label={`Valor de ejemplo ${value}`}>{value}</p>
      <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]" title={updatedAt}>{updatedAt}</p>
    </div>
  );
}

function PanelPreviewTable({
  columns,
  fieldSourcesById,
  searchable,
}: {
  columns: Extract<PanelModule["visualization"], { type: "TABLE" }>["config"]["columns"];
  fieldSourcesById: Map<string, { entity: AppViewEntityTypeOption; field: AppViewEntityTypeOption["fields"][number] }>;
  searchable?: boolean;
}) {
  const visibleColumns = columns.map((column) => ({
    ...column,
    field: fieldSourcesById.get(column.fieldId)?.field,
    label: fieldSourcesById.get(column.fieldId)?.field.name ?? column.fieldId,
  }));

  return (
    <div className="grid min-w-0 gap-2">
      {searchable ? (
        <div className="h-8 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-muted-foreground">
          Buscar en tabla...
        </div>
      ) : null}
      <div className="max-w-full overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full min-w-[420px] table-fixed border-collapse text-xs" data-panel-preview-table="true">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              {visibleColumns.length === 0 ? (
                <th className="px-3 py-2 text-left font-medium">Sin columnas</th>
              ) : visibleColumns.map((column) => (
                <th className="truncate px-3 py-2 text-left font-medium" key={column.fieldId} title={column.label}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2].map((rowIndex) => (
              <tr className="border-t border-slate-100" key={rowIndex}>
                {visibleColumns.length === 0 ? (
                  <td className="px-3 py-2 text-muted-foreground">Configura columnas</td>
                ) : visibleColumns.map((column) => {
                  const value = panelPreviewSampleValue(column.field, rowIndex, column.format);

                  return (
                    <td className="truncate px-3 py-2" key={`${column.fieldId}:${rowIndex}`} title={value} aria-label={value}>
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PanelPreviewWarnings({
  datasetName,
  fieldSourcesById,
  overlapWarnings,
  warnings,
}: {
  datasetName: string;
  fieldSourcesById: Map<string, { entity: AppViewEntityTypeOption; field: AppViewEntityTypeOption["fields"][number] }>;
  overlapWarnings: string[];
  warnings: Array<{ fieldId: string }>;
}) {
  if (warnings.length === 0 && overlapWarnings.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-1 rounded border border-amber-200 bg-amber-50/80 p-2 text-xs text-amber-950">
      {warnings.map((column) => {
        const columnName = fieldSourcesById.get(column.fieldId)?.field.name ?? column.fieldId;

        return <span className="[overflow-wrap:anywhere]" key={column.fieldId}>La columna {columnName} no pertenece al dataset {datasetName}.</span>;
      })}
      {overlapWarnings.map((warning) => <span className="[overflow-wrap:anywhere]" key={warning}>{warning}</span>)}
    </div>
  );
}

function panelOverlapWarningsByModuleId(layoutOverlaps: ReturnType<typeof panelModuleLayoutOverlaps>) {
  const overlapWarningsByModuleId = new Map<string, string[]>();

  for (const overlap of layoutOverlaps) {
    overlapWarningsByModuleId.set(overlap.left.id, [
      ...(overlapWarningsByModuleId.get(overlap.left.id) ?? []),
      `Se solapa con ${overlap.right.title || overlap.right.id}.`,
    ]);
    overlapWarningsByModuleId.set(overlap.right.id, [
      ...(overlapWarningsByModuleId.get(overlap.right.id) ?? []),
      `Se solapa con ${overlap.left.title || overlap.left.id}.`,
    ]);
  }

  return overlapWarningsByModuleId;
}

function panelPreviewSampleValue(
  field: AppViewEntityTypeOption["fields"][number] | undefined,
  rowIndex: number,
  format?: string,
) {
  if (!field) {
    return `Ejemplo ${rowIndex + 1}`;
  }
  if (field.type === "RELATION") return ["Procedimiento ejemplo", "Manual operativo", "Protocolo revisión"][rowIndex] ?? "Registro relacionado";
  if (field.type === "SELECT" || field.type === "MULTISELECT") return field.options[rowIndex % Math.max(field.options.length, 1)]?.label ?? "Opción ejemplo";
  if (field.type === "DATE") return format === "DD-MM-YYYY" ? "12-09-2026" : "2026-09-12";
  if (field.type === "DATETIME") return "12-09-2026 09:30";
  if (field.type === "TIME") return "09:30";
  if (field.type === "BOOLEAN") return rowIndex % 2 === 0 ? "Sí" : "No";
  if (field.type === "INTEGER") return String(120 + rowIndex);
  if (field.type === "DECIMAL" || field.type === "MONEY") return rowIndex === 0 ? "1.250,50" : "980,25";
  if (field.type === "TEXTAREA") return "Texto largo de ejemplo disponible completo";

  return ["Versión inicial", "Actualización", "Revisión final"][rowIndex] ?? "Texto de ejemplo";
}

function PanelErrorSummary({
  fieldErrors,
  onSelectSection,
}: {
  fieldErrors?: Record<string, string[]>;
  onSelectSection?: (section: PanelEditorSectionId) => void;
}) {
  const items = panelErrorSummaryItems(fieldErrors);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
      <p className="font-medium">Revisa la configuración del panel.</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            className="rounded border border-destructive/30 bg-background px-2 py-1 text-left"
            key={`${item.sectionId}-${item.message}`}
            onClick={() => onSelectSection?.(item.sectionId)}
            type="button"
          >
            {item.label}: {item.message}
          </button>
        ))}
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
  disabled = false,
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
  disabled?: boolean;
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
        disabled={disabled}
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
  disabled = false,
  label,
  name,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
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
        disabled={disabled}
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
  metrics,
  modules,
  rowHeight,
}: {
  baseConfig?: PanelConfig;
  columns: number;
  datasets: PanelEditorDataset[];
  filters: PanelEditorFilter[];
  metrics: PanelEditorMetric[];
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
    metrics,
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
  const value = {
    ...config,
    modules: sortPanelModulesByLayout(config.modules),
  } as Record<string, unknown>;

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

export function cleanPanelDatasetForEntity(
  dataset: PanelEditorDataset,
  entityType: AppViewEntityTypeOption | undefined,
  entityTypes: AppViewEntityTypeOption[],
): PanelEditorDataset {
  const activeFieldIds = new Set(entityType?.fields.filter((field) => field.isActive).map((field) => field.id) ?? []);
  const fieldIds = dataset.transformation.fieldIds.filter((fieldId) => activeFieldIds.has(fieldId));

  if (dataset.transformation.type === "RECORDS") {
    return {
      ...dataset,
      transformation: {
        type: "RECORDS",
        fieldIds,
        pagination: dataset.transformation.pagination,
      },
      filters: cleanPanelFilterExpressionsForEntity(dataset.filters, activeFieldIds),
      sort: cleanPanelSortForEntity(dataset.sort, entityType),
    };
  }

  const latestByRelation = dataset.transformation;
  const relationStillValid = entityType?.fields.some((field) =>
    field.id === latestByRelation.relationFieldId &&
    field.isActive &&
    field.type === "RELATION" &&
    relationTargetEntityTypeId(field.config) === latestByRelation.relatedEntityTypeId,
  ) ?? false;
  const orderStillValid = entityType?.fields.some((field) =>
    field.id === latestByRelation.orderFieldId &&
    field.isActive &&
    reportSortableFieldTypes.has(field.type),
  ) ?? false;
  const requiredStillValid = !latestByRelation.requiredValueFieldId ||
    activeFieldIds.has(latestByRelation.requiredValueFieldId);
  const nextRelatedEntityTypeId = relationStillValid
    ? latestByRelation.relatedEntityTypeId
    : relationTargetEntityTypeIds(entityType)[0] ?? entityTypes[0]?.id ?? "";

  return {
    ...dataset,
    transformation: {
      type: "LATEST_BY_RELATION",
      relatedEntityTypeId: nextRelatedEntityTypeId,
      relationFieldId: relationStillValid ? latestByRelation.relationFieldId : "",
      orderFieldId: orderStillValid ? latestByRelation.orderFieldId : "",
      requiredValueFieldId: requiredStillValid ? latestByRelation.requiredValueFieldId : undefined,
      fieldIds,
      pagination: latestByRelation.pagination,
    },
    filters: cleanPanelFilterExpressionsForEntity(dataset.filters, activeFieldIds),
    sort: cleanPanelSortForEntity(dataset.sort, entityType),
  };
}

export function cleanPanelModulesForDatasets(
  modules: PanelEditorModule[],
  datasets: PanelEditorDataset[],
) {
  return modules.map((module) => {
    const dataset = datasets.find((item) => item.id === module.datasetId);

    return {
      ...module,
      visualization: cleanPanelModuleVisualizationForDataset(module.visualization, dataset, []),
    };
  });
}

function cleanPanelModuleVisualizationForDataset(
  visualization: PanelEditorModule["visualization"],
  dataset: PanelEditorDataset | undefined,
  metrics: PanelEditorMetric[],
): PanelEditorModule["visualization"] {
  if (visualization.type === "KPI") {
    const metric = metrics.find((item) => item.id === visualization.config.metricId);

    return metric && metric.datasetId !== dataset?.id
      ? {
          type: "KPI",
          config: {
            ...visualization.config,
            metricId: metrics.find((item) => item.datasetId === dataset?.id)?.id ?? "",
          },
        }
      : visualization;
  }

  const datasetFieldIds = datasetFieldIdsForDataset(dataset);

  return {
    type: "TABLE",
    config: {
      ...visualization.config,
      columns: visualization.config.columns.filter((column) => datasetFieldIds.includes(column.fieldId)),
    },
  };
}

export function cleanPanelMetricsForDatasets(
  metrics: PanelEditorMetric[],
  datasets: PanelEditorDataset[],
) {
  return metrics.map((metric) => cleanPanelMetricForDataset(
    metric,
    datasets.find((dataset) => dataset.id === metric.datasetId),
  ));
}

function cleanPanelMetricForDataset(
  metric: PanelEditorMetric,
  dataset: PanelEditorDataset | undefined,
): PanelEditorMetric {
  const datasetFieldIds = datasetFieldIdsForDataset(dataset);
  const datasetFilterIds = new Set((dataset?.filters ?? [])
    .filter((filter) => filter.type === "PANEL_FILTER")
    .map((filter) => filter.filterId));

  return {
    ...metric,
    fieldId: metric.fieldId && datasetFieldIds.includes(metric.fieldId) ? metric.fieldId : null,
    filterIds: metric.filterIds.filter((filterId) => datasetFilterIds.has(filterId)),
    conditions: metric.conditions?.filter((condition) => datasetFieldIds.includes(condition.fieldId)),
  };
}

function cleanPanelMetricForAggregation(
  metric: PanelEditorMetric,
  fields: AppViewEntityTypeOption["fields"],
): PanelEditorMetric {
  if (metric.aggregation === "COUNT") {
    return { ...metric, fieldId: null };
  }

  const field = fields.find((item) => item.id === metric.fieldId);

  return field && panelMetricAggregationTargetsField(metric.aggregation, field.type)
    ? metric
    : { ...metric, fieldId: fields.find((item) => panelMetricAggregationTargetsField(metric.aggregation, item.type))?.id ?? null };
}

export function cleanPanelMetricConditionForField(
  condition: PanelMetricCondition,
  field: AppViewEntityTypeOption["fields"][number],
): PanelMetricCondition {
  const operatorOptions = panelMetricConditionOperatorOptions(field);
  const fallbackOperator = operatorOptions[0]?.value ?? "EQUALS";
  const operator = operatorOptions.some((option) => option.value === condition.operator)
    ? condition.operator
    : fallbackOperator;

  if (operator === "IS_EMPTY" || operator === "IS_NOT_EMPTY") {
    return { fieldId: field.id, operator };
  }

  if (operator === "IN" || operator === "NOT_IN") {
    const values = (condition.values ?? (condition.value ? [condition.value] : []))
      .filter((value) => panelMetricConditionValueMatchesField(value, field));

    return {
      fieldId: field.id,
      operator,
      values: values.length ? values : [defaultPanelMetricConditionValue(field)],
    };
  }

  const value = condition.value && panelMetricConditionValueMatchesField(condition.value, field)
    ? condition.value
    : defaultPanelMetricConditionValue(field);

  return { fieldId: field.id, operator, value };
}

function panelMetricConditionTargetsField(fieldType: string) {
  return ["SELECT", "MULTISELECT", "BOOLEAN", "TEXT", "TEXTAREA", "INTEGER", "DECIMAL", "MONEY", "DATE", "DATETIME"].includes(fieldType);
}

function panelMetricConditionOperatorOptions(field: AppViewEntityTypeOption["fields"][number] | undefined) {
  const all = [
    { label: "es", value: "EQUALS" },
    { label: "no es", value: "NOT_EQUALS" },
    { label: "está en", value: "IN" },
    { label: "no está en", value: "NOT_IN" },
    { label: "está vacío", value: "IS_EMPTY" },
    { label: "tiene valor", value: "IS_NOT_EMPTY" },
  ] as const satisfies Array<{ label: string; value: PanelMetricConditionOperator }>;

  return field && panelMetricConditionTargetsField(field.type) ? [...all] : [];
}

function defaultPanelMetricConditionValue(field: AppViewEntityTypeOption["fields"][number]): PanelMetricConditionValue {
  if (field.type === "SELECT" || field.type === "MULTISELECT") {
    return { type: "OPTION", optionId: field.options.find((option) => option.isActive)?.id ?? "" };
  }
  if (field.type === "BOOLEAN") {
    return { type: "BOOLEAN", value: true };
  }
  if (field.type === "INTEGER" || field.type === "DECIMAL" || field.type === "MONEY") {
    return { type: "NUMBER", value: 0 };
  }
  if (field.type === "DATE") {
    return { type: "DATE", value: "" };
  }
  if (field.type === "DATETIME") {
    return { type: "DATETIME", value: "" };
  }

  return { type: "TEXT", value: "" };
}

function panelMetricConditionValueMatchesField(
  value: PanelMetricConditionValue,
  field: AppViewEntityTypeOption["fields"][number],
) {
  if (field.type === "SELECT" || field.type === "MULTISELECT") {
    return value.type === "OPTION" && field.options.some((option) => option.id === value.optionId && option.isActive);
  }
  if (field.type === "BOOLEAN") return value.type === "BOOLEAN";
  if (field.type === "INTEGER" || field.type === "DECIMAL" || field.type === "MONEY") return value.type === "NUMBER";
  if (field.type === "DATE") return value.type === "DATE";
  if (field.type === "DATETIME") return value.type === "DATETIME";

  return value.type === "TEXT";
}

function panelMetricConditionValueTypeForField(field: AppViewEntityTypeOption["fields"][number]) {
  if (field.type === "INTEGER" || field.type === "DECIMAL" || field.type === "MONEY") return "NUMBER";
  if (field.type === "DATE") return "DATE";
  if (field.type === "DATETIME") return "DATETIME";

  return "TEXT";
}

function panelMetricConditionValueFromInput(value: string, valueType: "TEXT" | "NUMBER" | "DATE" | "DATETIME"): PanelMetricConditionValue {
  if (valueType === "NUMBER") return { type: "NUMBER", value: Number(value) };
  if (valueType === "DATE") return { type: "DATE", value };
  if (valueType === "DATETIME") return { type: "DATETIME", value: value ? new Date(value).toISOString() : "" };

  return { type: "TEXT", value };
}

function panelMetricConditionInputValue(value: PanelMetricConditionValue, valueType: "TEXT" | "NUMBER" | "DATE" | "DATETIME") {
  if (valueType === "NUMBER") return value.type === "NUMBER" ? String(value.value) : "0";
  if (valueType === "DATE") return value.type === "DATE" ? value.value : "";
  if (valueType === "DATETIME") return value.type === "DATETIME" && value.value ? value.value.slice(0, 16) : "";
  if (value.type === "TEXT") return value.value;

  return "";
}

function panelMetricConditionSummary(
  condition: PanelMetricCondition,
  field: AppViewEntityTypeOption["fields"][number] | undefined,
) {
  const fieldName = field?.name ?? condition.fieldId;
  const operator = panelMetricConditionOperatorOptions(field).find((option) => option.value === condition.operator)?.label ?? condition.operator;

  if (condition.operator === "IS_EMPTY" || condition.operator === "IS_NOT_EMPTY") {
    return `${fieldName} ${operator}`;
  }

  const values = condition.operator === "IN" || condition.operator === "NOT_IN"
    ? condition.values ?? []
    : condition.value
      ? [condition.value]
      : [];
  const labels = values.map((value) => panelMetricConditionValueLabel(value, field)).join(", ");

  return `${fieldName} ${operator} ${labels || "sin valor"}`;
}

function panelMetricConditionValueLabel(
  value: PanelMetricConditionValue,
  field: AppViewEntityTypeOption["fields"][number] | undefined,
) {
  if (value.type === "OPTION") {
    return field?.options.find((option) => option.id === value.optionId)?.label ?? "Opción no disponible";
  }
  if (value.type === "BOOLEAN") return value.value ? "Sí" : "No";

  return String(value.value);
}

export function cleanPanelFiltersForEntity(
  filters: PanelEditorFilter[],
  entityType: AppViewEntityTypeOption | undefined,
) {
  const activeFieldIds = new Set(entityType?.fields.filter((field) => field.isActive).map((field) => field.id) ?? []);

  return filters.map((filter) => activeFieldIds.has(filter.fieldId ?? "")
    ? filter
    : {
        ...filter,
        fieldId: undefined,
        operator: undefined,
        valueType: "TEXT" as const,
      });
}

export function incompatiblePanelColumns(
  module: PanelEditorModule,
  datasets: PanelEditorDataset[],
) {
  if (module.visualization.type !== "TABLE") {
    return [];
  }

  const dataset = datasets.find((item) => item.id === module.datasetId);
  const datasetFieldIds = datasetFieldIdsForDataset(dataset);

  return module.visualization.config.columns.filter((column) => !datasetFieldIds.includes(column.fieldId));
}

function cleanPanelFilterExpressionsForEntity(
  filters: FilterExpr[] | undefined,
  activeFieldIds: Set<string>,
) {
  const next = filters?.filter((filter) => activeFieldIds.has(filter.fieldId));

  return next?.length ? next : undefined;
}

function cleanPanelSortForEntity(
  sort: DatasetDefinition["sort"],
  entityType: AppViewEntityTypeOption | undefined,
) {
  const sortableFieldIds = new Set(
    entityType?.fields
      .filter((field) => field.isActive && reportSortableFieldTypes.has(field.type))
      .map((field) => field.id) ?? [],
  );
  const next = sort?.filter((item) => sortableFieldIds.has(item.fieldId));

  return next?.length ? next : undefined;
}

function datasetFieldIdsForDataset(dataset: PanelEditorDataset | undefined) {
  return dataset?.transformation.fieldIds ?? [];
}

function fieldsForPanelDataset(
  dataset: PanelEditorDataset | undefined,
  entityTypes: AppViewEntityTypeOption[],
) {
  const entityType = entityTypes.find((item) => item.id === dataset?.source.entityTypeId);
  const fieldIds = datasetFieldIdsForDataset(dataset);

  return fieldIds
    .map((fieldId) => entityType?.fields.find((field) => field.id === fieldId && field.isActive))
    .filter((field): field is AppViewEntityTypeOption["fields"][number] => Boolean(field));
}

function panelFieldSourcesById(entityTypes: AppViewEntityTypeOption[]) {
  const sources = new Map<string, {
    entity: AppViewEntityTypeOption;
    field: AppViewEntityTypeOption["fields"][number];
  }>();

  for (const entity of entityTypes) {
    for (const field of entity.fields) {
      sources.set(field.id, { entity, field });
    }
  }

  return sources;
}

export function sortPanelModulesByLayout<T extends { layout: { x: number; y: number }; id: string }>(modules: T[]) {
  return [...modules].sort((left, right) =>
    left.layout.y - right.layout.y ||
    left.layout.x - right.layout.x ||
    left.id.localeCompare(right.id),
  );
}

export function packPanelModules<T extends { layout: { x: number; y: number; w: number; h: number } }>(
  modules: T[],
  layoutColumns: number,
) {
  const columns = Math.max(layoutColumns, 1);
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  return modules.map((module) => {
    const width = Math.min(Math.max(module.layout.w, 1), columns);
    const height = Math.max(module.layout.h, 1);

    if (cursorX > 0 && cursorX + width > columns) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }

    const layout = {
      ...module.layout,
      x: cursorX,
      y: cursorY,
      w: width,
      h: height,
    };

    cursorX += width;
    rowHeight = Math.max(rowHeight, height);

    return { ...module, layout };
  });
}

export function panelModuleLayoutOverlaps<T extends {
  id: string;
  title?: string;
  layout: { x: number; y: number; w: number; h: number };
}>(modules: T[]) {
  const overlaps: Array<{ left: T; right: T }> = [];

  for (let leftIndex = 0; leftIndex < modules.length; leftIndex += 1) {
    const left = modules[leftIndex];

    if (!left) {
      continue;
    }

    for (let rightIndex = leftIndex + 1; rightIndex < modules.length; rightIndex += 1) {
      const right = modules[rightIndex];

      if (right && panelModuleLayoutsOverlap(left.layout, right.layout)) {
        overlaps.push({ left, right });
      }
    }
  }

  return overlaps;
}

function panelModuleLayoutsOverlap(
  left: { x: number; y: number; w: number; h: number },
  right: { x: number; y: number; w: number; h: number },
) {
  return left.x < right.x + right.w &&
    left.x + left.w > right.x &&
    left.y < right.y + right.h &&
    left.y + left.h > right.y;
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

function panelMetricAggregationOptions() {
  return [
    { label: "Contar registros", value: "COUNT" },
    { label: "Contar valores", value: "COUNT_VALUES" },
    { label: "Contar distintos", value: "COUNT_DISTINCT" },
    { label: "Sumar", value: "SUM" },
    { label: "Promedio", value: "AVG" },
    { label: "Mínimo", value: "MIN" },
    { label: "Máximo", value: "MAX" },
  ];
}

function panelKpiFormatOptions() {
  return [
    { label: "Número", value: "NUMBER" },
    { label: "Entero", value: "INTEGER" },
    { label: "Decimal", value: "DECIMAL" },
    { label: "Moneda", value: "MONEY" },
    { label: "Porcentaje", value: "PERCENT" },
    { label: "Fecha", value: "DATE" },
    { label: "Fecha y hora", value: "DATETIME" },
  ];
}

function panelCurrencyCodeOptions() {
  return [
    { label: "CLP", value: "CLP" },
    { label: "USD", value: "USD" },
    { label: "EUR", value: "EUR" },
  ];
}

function panelPercentScaleOptions() {
  return [
    { label: "Proporción: 0,25 → 25 %", value: "RATIO" },
    { label: "Porcentaje completo: 25 → 25 %", value: "WHOLE" },
  ];
}

export function cleanPanelKpiConfigForFormat(
  config: PanelKpiConfig,
  format: PanelKpiFormat,
): PanelKpiConfig {
  const base = {
    metricId: config.metricId,
    label: config.label,
  };

  if (format === "MONEY") {
    return {
      ...base,
      format,
      currencyCode: config.format === "MONEY" ? config.currencyCode : "CLP",
    };
  }

  if (format === "PERCENT") {
    return {
      ...base,
      format,
      percentScale: config.format === "PERCENT" ? config.percentScale : "RATIO",
    };
  }

  return { ...base, format };
}

function panelKpiPreviewValue(config: PanelKpiConfig) {
  if (config.format === "MONEY") {
    return new Intl.NumberFormat("es-CL", {
      currency: config.currencyCode,
      style: "currency",
    }).format(1234);
  }

  if (config.format === "PERCENT") {
    return config.percentScale === "RATIO" ? "25 %" : "25 %";
  }

  if (config.format === "DATE") {
    return "31-12-2026";
  }

  if (config.format === "DATETIME") {
    return "31-12-2026 15:30";
  }

  if (config.format === "INTEGER") {
    return "1.234";
  }

  if (config.format === "DECIMAL") {
    return "1.234,56";
  }

  return "1.234";
}

function panelMetricAggregationTargetsField(aggregation: PanelMetricAggregation, fieldType: string) {
  if (aggregation === "COUNT_VALUES" || aggregation === "COUNT_DISTINCT") {
    return true;
  }
  if (aggregation === "SUM" || aggregation === "AVG") {
    return ["INTEGER", "DECIMAL", "MONEY"].includes(fieldType);
  }
  if (aggregation === "MIN" || aggregation === "MAX") {
    return ["INTEGER", "DECIMAL", "MONEY", "DATE", "DATETIME"].includes(fieldType);
  }

  return aggregation === "COUNT";
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

function panelSectionHasErrors(sectionId: string, fieldErrors: Record<string, string[]> | undefined) {
  if (!fieldErrors) {
    return false;
  }

  return panelErrorSummaryItems(fieldErrors).some((item) => item.sectionId === sectionId);
}

function firstPanelErrorSection(fieldErrors: Record<string, string[]> | undefined): PanelEditorSectionId | null {
  return panelErrorSummaryItems(fieldErrors)[0]?.sectionId ?? null;
}

function panelErrorSummaryItems(fieldErrors: Record<string, string[]> | undefined) {
  if (!fieldErrors) {
    return [];
  }

  return Object.entries(fieldErrors)
    .filter(([key]) => key !== "form" && key !== "panelConfig")
    .flatMap(([fieldName, messages]) => {
      const sectionId = panelErrorSectionId(fieldName);

      if (!sectionId) {
        return [];
      }

      return messages.map((message) => ({
        label: panelErrorSectionLabel(sectionId),
        message,
        sectionId,
      }));
    });
}

function panelErrorSectionId(fieldName: string): PanelEditorSectionId | "" {
  if (["datasets", "panelDatasetFields", "panelDatasetRelation", "panelDatasetOrder"].includes(fieldName)) {
    return "fuentes-de-datos";
  }
  if (fieldName === "filters") {
    return "filtros";
  }
  if (["metrics", "panelKpiMetric"].includes(fieldName)) {
    return "metricas";
  }
  if (["modules", "panelModuleColumns"].includes(fieldName)) {
    return "modulos";
  }
  if (fieldName === "layout") {
    return "diseno";
  }

  return "";
}

function panelErrorSectionLabel(sectionId: string) {
  if (sectionId === "fuentes-de-datos") return "Fuentes de datos";
  if (sectionId === "filtros") return "Filtros";
  if (sectionId === "metricas") return "Métricas";
  if (sectionId === "modulos") return "Módulos";
  if (sectionId === "diseno") return "Diseño";

  return "Panel";
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
  helpText,
  label,
  name,
  onChange,
  options,
  value,
}: {
  errors?: string[];
  helpText?: string;
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
      {helpText ? <span className="text-xs font-normal text-muted-foreground">{helpText}</span> : null}
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
