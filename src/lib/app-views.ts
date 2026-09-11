import { Prisma, type AppView, type AppViewType } from "@prisma/client";
import { z } from "zod";

import { getAuthorizedContractAdmin } from "./contracts";
import { isEntityIconKey } from "./entity-icons";
import { getRelationConfig } from "./field-validation";
import { slugify } from "./format";
import { prisma } from "./prisma";
import {
  getWorkflowLabel,
  workflowKeys,
  workflowOptions,
} from "./workflow-catalog";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const appViewTypeValues = ["RECORDS", "WORKFLOW", "REPORT", "BOARD", "DASHBOARD", "PANEL"] as const;
type PrismaClientLike = typeof prisma | Prisma.TransactionClient;

export const appViewTypeOptions = [
  { label: "Registros", value: "RECORDS" },
  { label: "Flujo", value: "WORKFLOW" },
  { label: "Reporte", value: "REPORT" },
  { label: "Tablero", value: "BOARD" },
  { label: "Dashboard", value: "DASHBOARD" },
  { label: "Panel", value: "PANEL" },
] as const satisfies Array<{ label: string; value: AppViewType }>;

export const appViewWorkflowOptions = [
  ...workflowOptions,
] as const;

export const appViewCommonSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "El slug debe tener al menos 2 caracteres.")
    .regex(slugRegex, "Usa solo minúsculas, números y guiones."),
  icon: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .refine((value) => value === undefined || isEntityIconKey(value), {
      message: "Selecciona un icono válido.",
    }),
  type: z.enum(appViewTypeValues),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(0),
});

export type AppViewConfig =
  | {
      type: "RECORDS";
      entityTypeId: string;
    }
  | AttendanceWorkflowConfig
  | StateUpdateWorkflowConfig
  | ReportAppViewConfig
  | { type: "BOARD"; entityTypeId: string; groupByFieldKey: string }
  | { type: "DASHBOARD"; entityTypeIds: string[] }
  | PanelConfig;

export type PanelConfig = {
  type: "PANEL";
  schemaVersion: 1;
  layout: {
    columns: number;
    rowHeight?: number;
  };
  filters: PanelFilter[];
  datasets: DatasetDefinition[];
  metrics: PanelMetric[];
  calculatedFields: [];
  modules: PanelModule[];
};

export type PanelMetricAggregation =
  | "COUNT"
  | "COUNT_VALUES"
  | "COUNT_DISTINCT"
  | "SUM"
  | "AVG"
  | "MIN"
  | "MAX";

export type PanelKpiFormat =
  | "NUMBER"
  | "INTEGER"
  | "DECIMAL"
  | "MONEY"
  | "PERCENT"
  | "DATE"
  | "DATETIME";

export type PanelPercentScale = "RATIO" | "WHOLE";

export type PanelKpiConfig =
  | {
      metricId: string;
      label: string;
      format: Exclude<PanelKpiFormat, "MONEY" | "PERCENT">;
      currencyCode?: never;
      percentScale?: never;
    }
  | {
      metricId: string;
      label: string;
      format: "MONEY";
      currencyCode: string;
      percentScale?: never;
    }
  | {
      metricId: string;
      label: string;
      format: "PERCENT";
      percentScale: PanelPercentScale;
      currencyCode?: never;
    };

export type PanelMetric = {
  id: string;
  name: string;
  datasetId: string;
  aggregation: PanelMetricAggregation;
  fieldId?: string | null;
  filterIds: string[];
};

export type PanelFilter = {
  id: string;
  label?: string;
  valueType: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "OPTION" | "RECORD";
  required?: boolean;
};

export type FilterExpr =
  | {
      type: "FIELD_VALUE";
      fieldId: string;
      operator: "EQ" | "IN" | "HAS_VALUE";
      value?: unknown;
      values?: unknown[];
    }
  | {
      type: "PANEL_FILTER";
      filterId: string;
      fieldId: string;
      operator: "EQ" | "IN";
    };

export type SortSpec = {
  fieldId: string;
  direction: "asc" | "desc";
};

export type DatasetDefinition = {
  id: string;
  name?: string;
  source: {
    type: "ENTITY";
    entityTypeId: string;
  };
  filters?: FilterExpr[];
  sort?: SortSpec[];
  transformation:
    | {
        type: "RECORDS";
        fieldIds: string[];
        pagination?: {
          pageSize: number;
        };
      }
    | {
        type: "LATEST_BY_RELATION";
        relatedEntityTypeId: string;
        relationFieldId: string;
        orderFieldId: string;
        requiredValueFieldId?: string;
        fieldIds: string[];
        pagination?: {
          pageSize: number;
        };
      };
};

export type PanelModule = {
  id: string;
  title?: string;
  datasetId: string;
  visualization:
    | {
        type: "TABLE";
        config: {
          columns: Array<{
            fieldId: string;
            label?: string;
            valueDisplay?: ReportSelectValueDisplay;
            format?: string;
          }>;
          searchable?: boolean;
          paginated?: boolean;
        };
      }
    | {
        type: "KPI";
        config: PanelKpiConfig;
      };
  layout: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
};

export type ReportAppViewConfig =
  | {
      type: "REPORT";
      sourceMode?: "ENTITY";
      entityTypeId: string;
      timeFilter: ReportTimeFilterConfig;
      valueDisplay: Record<string, ReportSelectValueDisplay>;
      presentationMode: "CURRENT_STATUS";
      currentStatus: {
        subjectFieldId?: string;
        relationFieldId?: string;
        stateFieldId?: string;
        requiredValueFieldId?: string;
        dateFieldId?: string;
        orderFieldId?: string;
        displayFieldIds?: string[];
      };
      latestByRelation?: never;
      dateFieldId?: never;
      table?: never;
      matrix?: never;
    }
  | {
      type: "REPORT";
      sourceMode?: "ENTITY";
      entityTypeId: string;
      timeFilter: ReportTimeFilterConfig;
      valueDisplay: Record<string, ReportSelectValueDisplay>;
      presentationMode: "LATEST_BY_RELATION";
      latestByRelation: {
        relatedEntityTypeId: string;
        relationFieldId: string;
        orderFieldId: string;
        requiredValueFieldId?: string;
        displayFieldIds: string[];
      };
      currentStatus?: never;
      dateFieldId?: never;
      table?: never;
      matrix?: never;
    }
  | ({
      type: "REPORT";
      sourceMode?: "ENTITY";
      entityTypeId: string;
      dateFieldId: string;
      timeFilter: ReportTimeFilterConfig;
      valueDisplay: Record<string, ReportSelectValueDisplay>;
    } & (
      | {
          presentationMode: "TABLE";
          table: {
            visibleFieldIds: string[];
            defaultSortFieldId?: string;
            defaultSortDirection: "asc" | "desc";
          };
          matrix?: never;
        }
      | {
          presentationMode: "MATRIX";
          matrix: {
            rowFieldId: string;
            columnFieldId: string;
            valueFieldId: string;
            summaryFieldId?: string;
          };
          table?: never;
        }
    ))
  | {
      type: "REPORT";
      sourceMode: "STATE_UPDATE";
      stateUpdateAppViewId: string;
      projection: "CURRENT";
      presentationMode: "TABLE";
      timeFilter: ReportTimeFilterConfig;
      valueDisplay: Record<string, ReportSelectValueDisplay>;
      table: {
        visibleFieldIds: string[];
        defaultSortFieldId?: string;
        defaultSortDirection: "asc" | "desc";
      };
      entityTypeId?: never;
      dateFieldId?: never;
      matrix?: never;
    };

export type ReportTimeFilterConfig = {
  mode: "RANGE" | "MONTH";
  defaultPeriod: "CURRENT_MONTH";
  allowChange: boolean;
};

export type ReportSelectValueDisplay = "LABEL" | "INTERNAL_VALUE";

const defaultReportTimeFilter = {
  allowChange: true,
  defaultPeriod: "CURRENT_MONTH",
  mode: "RANGE",
} as const satisfies ReportTimeFilterConfig;

export type AttendanceWorkflowConfig = {
      type: "WORKFLOW";
      workflowKey: "attendance";
      sourceEntityTypeId: string;
      targetEntityTypeId: string;
      personFieldId: string;
      dateFieldId: string;
      statusFieldId: string;
      defaultCheckInOptionId: string;
      contextFieldIds?: string[];
      observationFieldId?: string;
    };

export type StateUpdateWorkflowConfig = {
  type: "WORKFLOW";
  workflowKey: "state-update";
  sourceEntityTypeId: string;
  targetEntityTypeId: string;
  subjectFieldId: string;
  stateFields: Array<{
    defaultOptionId?: string;
    fieldId: string;
    label?: string;
    required: boolean;
  }>;
  extraFieldIds: string[];
  dateFieldId?: string;
  uniqueness: {
    mode: "none" | "subject" | "subject-date";
  };
  historyMode: "append" | "update-current";
};

export type AppViewInput = z.infer<typeof appViewCommonSchema> & {
  config: AppViewConfig;
};

export function getAppViewTypeLabel(type: AppViewType | string) {
  return appViewTypeOptions.find((option) => option.value === type)?.label ?? String(type);
}

export function getAppViewWorkflowLabel(workflow: string) {
  return getWorkflowLabel(workflow);
}

export function getAppViewInput(formData: FormData) {
  return {
    common: appViewCommonSchema.parse({
      active: parseFormBoolean(formData, "active"),
      icon: formData.get("icon") || undefined,
      name: formData.get("name"),
      slug: formData.get("slug"),
      sortOrder: formData.get("sortOrder") || 0,
      type: formData.get("type"),
    }),
    rawConfig: {
      entityTypeId: formData.get("entityTypeId"),
      entityTypeIds: formData.getAll("entityTypeIds"),
      groupByFieldKey: formData.get("groupByFieldKey"),
      dateFieldId: formData.get("dateFieldId"),
      defaultSortDirection: formData.get("defaultSortDirection"),
      defaultSortFieldId: formData.get("defaultSortFieldId"),
      defaultCheckInOptionId: formData.get("defaultCheckInOptionId") ?? formData.get("presentOptionId"),
      contextFieldIds: formData.getAll("contextFieldIds"),
      extraFieldIds: formData.getAll("extraFieldIds"),
      historyMode: formData.get("historyMode"),
      observationFieldId: formData.get("observationFieldId"),
      personFieldId: formData.get("personFieldId"),
      presentationMode: formData.get("presentationMode"),
      reportTimeAllowChange: parseFormBoolean(formData, "reportTimeAllowChange"),
      reportTimeDefaultPeriod: formData.get("reportTimeDefaultPeriod"),
      reportTimeMode: formData.get("reportTimeMode"),
      reportValueDisplay: Object.fromEntries(
        Array.from(formData.entries())
          .filter(([key]) => key.startsWith("reportValueDisplay:"))
          .map(([key, value]) => [key.slice("reportValueDisplay:".length), value]),
      ),
      requiredStateFieldIds: formData.getAll("requiredStateFieldIds"),
      reportColumnFieldId: formData.get("reportColumnFieldId"),
      latestByRelationOrderFieldId: formData.get("latestByRelationOrderFieldId"),
      latestByRelationRelatedEntityTypeId: formData.get("latestByRelationRelatedEntityTypeId"),
      latestByRelationRelationFieldId: formData.get("latestByRelationRelationFieldId"),
      latestByRelationRequiredValueFieldId: formData.get("latestByRelationRequiredValueFieldId"),
      panelConfig: formData.get("panelConfig"),
      reportProjection: formData.get("reportProjection"),
      reportRowFieldId: formData.get("reportRowFieldId"),
      reportSummaryFieldId: formData.get("reportSummaryFieldId"),
      reportValueFieldId: formData.get("reportValueFieldId"),
      reportSourceMode: formData.get("reportSourceMode"),
      sourceEntityTypeId: formData.get("sourceEntityTypeId"),
      stateUpdateAppViewId: formData.get("stateUpdateAppViewId"),
      stateFieldIds: formData.getAll("stateFieldIds"),
      stateFieldDefaultOptions: Object.fromEntries(
        Array.from(formData.entries())
          .filter(([key]) => key.startsWith("stateFieldDefaultOptionId:"))
          .map(([key, value]) => [key.slice("stateFieldDefaultOptionId:".length), value]),
      ),
      statusFieldId: formData.get("statusFieldId"),
      currentStatusOrderFieldId: formData.get("currentStatusOrderFieldId"),
      currentStatusRelationFieldId: formData.get("currentStatusRelationFieldId"),
      currentStatusRequiredValueFieldId: formData.get("currentStatusRequiredValueFieldId"),
      currentStatusDateFieldId: formData.get("currentStatusDateFieldId"),
      currentStatusStateFieldId: formData.get("currentStatusStateFieldId"),
      currentStatusSubjectFieldId: formData.get("currentStatusSubjectFieldId"),
      displayFieldIds: formData.getAll("displayFieldIds"),
      subjectFieldId: formData.get("subjectFieldId"),
      targetEntityTypeId: formData.get("targetEntityTypeId"),
      uniquenessMode: formData.get("uniquenessMode"),
      visibleFieldIds: formData.getAll("visibleFieldIds"),
      workflow: formData.get("workflow"),
      workflowKey: formData.get("workflowKey") ?? formData.get("workflow"),
    },
  };
}

export async function getAppViewAdminData(contractId: string, userId: string) {
  const contract = await getAuthorizedContractAdmin(contractId, userId);

  if (!contract) {
    return null;
  }

  const [appViews, entityTypes] = await Promise.all([
    prisma.appView.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
      where: { contractId: contract.id },
    }),
    prisma.entityType.findMany({
      orderBy: { name: "asc" },
      select: {
        fields: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            isActive: true,
            key: true,
            multiple: true,
            name: true,
            config: true,
            options: {
              orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
              select: {
                id: true,
                isActive: true,
                label: true,
                value: true,
              },
            },
            type: true,
          },
        },
        icon: true,
        id: true,
        isActive: true,
        name: true,
        nature: true,
        slug: true,
      },
      where: { contractId: contract.id, isActive: true },
    }),
  ]);

  return { appViews, contract, entityTypes };
}

export async function getAuthorizedAppView(
  contractId: string,
  appViewId: string,
  userId: string,
) {
  const data = await getAppViewAdminData(contractId, userId);

  if (!data) {
    return null;
  }

  const appView = await prisma.appView.findFirst({
    where: {
      contractId: data.contract.id,
      id: appViewId,
    },
  });

  if (!appView) {
    return null;
  }

  return { ...data, appView };
}

export async function createAppView(
  contractId: string,
  userId: string,
  input: ReturnType<typeof getAppViewInput>,
) {
  const contract = await getAuthorizedContractAdmin(contractId, userId);

  if (!contract) {
    return null;
  }

  const config = await validateAppViewConfig({
    contractId: contract.id,
    rawConfig: input.rawConfig,
    type: input.common.type,
  });

  return prisma.appView.create({
    data: {
      active: input.common.active,
      config: toJsonConfig(config),
      contractId: contract.id,
      icon: input.common.icon || null,
      name: input.common.name,
      slug: input.common.slug,
      sortOrder: input.common.sortOrder,
      type: input.common.type,
    },
  });
}

export async function updateAppView(
  contractId: string,
  appViewId: string,
  userId: string,
  input: ReturnType<typeof getAppViewInput>,
) {
  const authorized = await getAuthorizedAppView(contractId, appViewId, userId);

  if (!authorized) {
    return null;
  }

  const config = await validateAppViewConfig({
    contractId: authorized.contract.id,
    rawConfig: input.rawConfig,
    type: input.common.type,
  });

  return prisma.appView.update({
    data: {
      active: input.common.active,
      config: toJsonConfig(config),
      icon: input.common.icon || null,
      name: input.common.name,
      slug: input.common.slug,
      sortOrder: input.common.sortOrder,
      type: input.common.type,
    },
    where: { id: authorized.appView.id },
  });
}

export async function setAppViewActive(
  contractId: string,
  appViewId: string,
  userId: string,
  active: boolean,
) {
  const authorized = await getAuthorizedAppView(contractId, appViewId, userId);

  if (!authorized) {
    return null;
  }

  return prisma.appView.update({
    data: { active },
    where: { id: authorized.appView.id },
  });
}

export function parseAppViewConfig(view: Pick<AppView, "config" | "type">): AppViewConfig {
  const config = view.config;

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Invalid AppView config.");
  }

  const raw = config as Record<string, unknown>;

  if (view.type === "RECORDS") {
    return { type: "RECORDS", ...parseRecordsConfigInput(raw) };
  }

  if (view.type === "WORKFLOW") {
    return { type: "WORKFLOW", ...parseWorkflowConfigInput(raw) };
  }

  if (view.type === "REPORT") {
    return { type: "REPORT", ...parseReportConfigInput(raw) };
  }

  if (view.type === "BOARD") {
    return { type: "BOARD", ...boardConfigInputSchema.parse(raw) };
  }

  if (view.type === "DASHBOARD") {
    return { type: "DASHBOARD", ...dashboardConfigInputSchema.parse(raw) };
  }

  return { type: "PANEL", ...parsePanelConfigInput(raw) };
}

export function summarizeAppViewConfig({
  config,
  entityTypes,
}: {
  config: AppViewConfig;
  entityTypes: Array<{
    fields: Array<{ key: string; name: string }>;
    id: string;
    name: string;
  }>;
}) {
  const entityName = (id: string) =>
    entityTypes.find((entityType) => entityType.id === id)?.name ?? "Entidad no disponible";

  if (config.type === "RECORDS") {
    return entityName(config.entityTypeId);
  }

  if (config.type === "WORKFLOW") {
    return `${entityName(config.sourceEntityTypeId)} -> ${entityName(config.targetEntityTypeId)} · ${getAppViewWorkflowLabel(config.workflowKey)}`;
  }

  if (config.type === "REPORT") {
    if (config.sourceMode === "STATE_UPDATE") {
      return `Actualización de estado · ${config.projection === "CURRENT" ? "Estado actual" : config.projection}`;
    }

    const presentationLabel = config.presentationMode === "TABLE"
      ? "Tabla"
      : config.presentationMode === "MATRIX"
        ? "Matriz"
        : "Último por relación";

    return `${entityName(config.entityTypeId)} · ${presentationLabel}`;
  }

  if (config.type === "BOARD") {
    const entityType = entityTypes.find((item) => item.id === config.entityTypeId);
    const field = entityType?.fields.find((item) => item.key === config.groupByFieldKey);

    return `${entityName(config.entityTypeId)} · ${field?.name ?? config.groupByFieldKey}`;
  }

  if (config.type === "PANEL") {
    return `${config.datasets.length} dataset(s) · ${config.modules.length} módulo(s)`;
  }

  return config.entityTypeIds.map(entityName).join(", ");
}

export function friendlyAppViewError(error: unknown) {
  if (error instanceof z.ZodError) {
    return appViewFieldErrors(error)?.form?.[0] ??
      appViewFieldErrors(error)?.panelConfig?.[0] ??
      appViewFieldErrors(error)?.datasets?.[0] ??
      appViewFieldErrors(error)?.modules?.[0] ??
      "Revisa los datos de la vista.";
  }

  if (error instanceof Error && error.name === "AppViewConfigError") {
    return error.message;
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return "Ya existe una vista con ese slug en este contrato.";
  }

  return "No fue posible guardar la vista.";
}

export function appViewFieldErrors(error: unknown) {
  if (error instanceof z.ZodError) {
    const fieldErrors: Record<string, string[]> = {};

    for (const issue of error.issues) {
      const mapped = panelZodIssueFieldError(issue) ?? {
        fieldName: issue.path.join(".") || "form",
        message: humanZodIssueMessage(issue),
      };

      fieldErrors[mapped.fieldName] = [
        ...(fieldErrors[mapped.fieldName] ?? []),
        mapped.message,
      ];
    }

    if (Object.keys(fieldErrors).some((key) => panelErrorSection(key))) {
      fieldErrors.form = [
        "Revisa la configuración del panel. Hay campos obligatorios o selecciones incompatibles.",
      ];
    }

    return fieldErrors;
  }

  if (error instanceof AppViewConfigError && error.fieldName) {
    return { [error.fieldName]: [error.message] };
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    const target = Array.isArray(error.meta?.target)
      ? error.meta.target.join(", ")
      : "";

    if (target.includes("slug")) {
      return { slug: ["Ya existe una vista con ese slug en este contrato."] };
    }
  }

  return undefined;
}

function panelZodIssueFieldError(issue: z.core.$ZodIssue) {
  const path = issue.path.map(String);
  const dottedPath = path.join(".");

  if (dottedPath === "datasets") {
    return { fieldName: "datasets", message: "Agrega al menos una fuente de datos." };
  }

  if (dottedPath.match(/^datasets\.\d+\.transformation\.fieldIds$/)) {
    return { fieldName: "panelDatasetFields", message: "Selecciona al menos un campo para el dataset." };
  }

  if (dottedPath === "modules") {
    return { fieldName: "modules", message: "Agrega al menos un módulo." };
  }

  if (dottedPath.match(/^modules\.\d+\.visualization\.config\.columns$/)) {
    return { fieldName: "panelModuleColumns", message: "Selecciona al menos una columna para la tabla." };
  }

  if (dottedPath.match(/^modules\.\d+\.visualization\.config\.metricId$/)) {
    return { fieldName: "panelKpiMetric", message: "Selecciona una métrica para el KPI." };
  }

  if (dottedPath.match(/^modules\.\d+\.visualization\.config\.currencyCode$/)) {
    return { fieldName: "panelKpiMetric", message: "Ingresa un código de moneda ISO 4217 de tres letras." };
  }

  if (dottedPath.match(/^modules\.\d+\.visualization\.config\.percentScale$/)) {
    return { fieldName: "panelKpiMetric", message: "Selecciona cómo interpretar el porcentaje." };
  }

  if (dottedPath === "metrics" || dottedPath.startsWith("metrics.")) {
    return { fieldName: "metrics", message: "Revisa la configuración de métricas." };
  }

  if (dottedPath.match(/^datasets\.\d+\.transformation\.relationFieldId$/)) {
    return { fieldName: "panelDatasetRelation", message: "Selecciona el campo relacionado." };
  }

  if (dottedPath.match(/^datasets\.\d+\.transformation\.orderFieldId$/)) {
    return { fieldName: "panelDatasetOrder", message: "Selecciona el campo que determina el último registro." };
  }

  if (dottedPath === "layout" || dottedPath.startsWith("layout.") || dottedPath.match(/^modules\.\d+\.layout/)) {
    return {
      fieldName: "layout",
      message: issue.message.startsWith("Los módulos ")
        ? issue.message
        : "Configura un layout válido para el módulo afectado.",
    };
  }

  return undefined;
}

function panelErrorSection(fieldName: string) {
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

function humanZodIssueMessage(issue: z.core.$ZodIssue) {
  if (issue.code === "unrecognized_keys") {
    return "La configuración contiene propiedades no soportadas.";
  }

  if (issue.code === "invalid_type") {
    return "Completa este campo con un valor válido.";
  }

  if (issue.code === "too_small") {
    return "Completa esta sección antes de guardar.";
  }

  return "Revisa este campo antes de guardar.";
}

async function validateAppViewConfig({
  contractId,
  rawConfig,
  type,
  client = prisma,
}: {
  contractId: string;
  rawConfig: ReturnType<typeof getAppViewInput>["rawConfig"];
  type: AppViewType;
  client?: PrismaClientLike;
}): Promise<AppViewConfig> {
  if (type === "RECORDS") {
    const config = parseRecordsConfigInput(rawConfig);
    await requireEntityType(client, contractId, config.entityTypeId);

    return {
      type,
      entityTypeId: config.entityTypeId,
    };
  }

  if (type === "WORKFLOW") {
    const config = parseWorkflowConfigInput(rawConfig);
    const sourceEntityType = await requireEntityType(client, contractId, config.sourceEntityTypeId);
    const targetEntityType = await requireEntityType(client, contractId, config.targetEntityTypeId);

    if (config.workflowKey === "attendance") {
      validateAttendanceAppViewFields({
        config,
        sourceEntityType: {
          id: sourceEntityType.id,
          name: sourceEntityType.name,
        },
        targetEntityType: {
          id: targetEntityType.id,
          name: targetEntityType.name,
        },
        targetFields: targetEntityType.fields,
      });
      return {
        type,
        workflowKey: config.workflowKey,
        sourceEntityTypeId: config.sourceEntityTypeId,
        targetEntityTypeId: config.targetEntityTypeId,
        personFieldId: config.personFieldId,
        dateFieldId: config.dateFieldId,
        statusFieldId: config.statusFieldId,
        defaultCheckInOptionId: config.defaultCheckInOptionId,
        ...(config.contextFieldIds.length > 0 ? { contextFieldIds: config.contextFieldIds } : {}),
        ...(config.observationFieldId ? { observationFieldId: config.observationFieldId } : {}),
      };
    }

    validateStateUpdateAppViewFields({
      config,
      sourceEntityType: {
        id: sourceEntityType.id,
        name: sourceEntityType.name,
      },
      targetFields: targetEntityType.fields,
    });

    return {
      type,
      workflowKey: config.workflowKey,
      sourceEntityTypeId: config.sourceEntityTypeId,
      targetEntityTypeId: config.targetEntityTypeId,
      subjectFieldId: config.subjectFieldId,
      stateFields: config.stateFields,
      extraFieldIds: config.extraFieldIds,
      ...(config.dateFieldId ? { dateFieldId: config.dateFieldId } : {}),
      uniqueness: config.uniqueness,
      historyMode: config.historyMode,
    };
  }

  if (type === "REPORT") {
    const config = parseReportConfigInput(rawConfig);

    if (config.sourceMode === "STATE_UPDATE") {
      const stateUpdateAppView = await requireStateUpdateReportSource(client, contractId, config.stateUpdateAppViewId);
      const stateUpdateConfig = parseAppViewConfig(stateUpdateAppView);

      if (stateUpdateConfig.type !== "WORKFLOW" || stateUpdateConfig.workflowKey !== "state-update") {
        throw new AppViewConfigError(
          "Selecciona una experiencia STATE_UPDATE válida.",
          "stateUpdateAppViewId",
        );
      }

      if (stateUpdateConfig.uniqueness.mode !== "subject") {
        throw new AppViewConfigError(
          "Los reportes de estado actual STATE_UPDATE solo soportan unicidad por sujeto en esta versión.",
          "stateUpdateAppViewId",
        );
      }

      validateStateUpdateReportTableFields(config, stateUpdateConfig);

      return {
        type,
        sourceMode: "STATE_UPDATE",
        stateUpdateAppViewId: config.stateUpdateAppViewId,
        projection: "CURRENT",
        presentationMode: "TABLE",
        timeFilter: config.timeFilter,
        valueDisplay: config.valueDisplay,
        table: {
          visibleFieldIds: config.table.visibleFieldIds,
          ...(config.table.defaultSortFieldId ? { defaultSortFieldId: config.table.defaultSortFieldId } : {}),
          defaultSortDirection: config.table.defaultSortDirection,
        },
      };
    }

    const entityType = await requireEntityType(client, contractId, config.entityTypeId);

    validateReportAppViewFields({
      config,
      fields: entityType.fields,
    });

    if (config.presentationMode === "TABLE") {
      return {
        type,
        entityTypeId: config.entityTypeId,
        dateFieldId: config.dateFieldId,
        timeFilter: config.timeFilter,
        valueDisplay: config.valueDisplay,
        presentationMode: "TABLE",
        table: {
          visibleFieldIds: config.table.visibleFieldIds,
          ...(config.table.defaultSortFieldId ? { defaultSortFieldId: config.table.defaultSortFieldId } : {}),
          defaultSortDirection: config.table.defaultSortDirection,
        },
      };
    }

    if (config.presentationMode === "CURRENT_STATUS") {
      const relationFieldId = config.currentStatus.relationFieldId ?? config.currentStatus.subjectFieldId;
      const requiredValueFieldId = config.currentStatus.requiredValueFieldId ?? config.currentStatus.stateFieldId;
      const orderFieldId = config.currentStatus.orderFieldId ?? config.currentStatus.dateFieldId;

      return {
        type,
        entityTypeId: config.entityTypeId,
        timeFilter: config.timeFilter,
        valueDisplay: config.valueDisplay,
        presentationMode: config.presentationMode,
        currentStatus: {
          ...(relationFieldId ? { relationFieldId, subjectFieldId: relationFieldId } : {}),
          ...(requiredValueFieldId ? { requiredValueFieldId, stateFieldId: requiredValueFieldId } : {}),
          ...(orderFieldId ? { orderFieldId, dateFieldId: orderFieldId } : {}),
          displayFieldIds: config.currentStatus.displayFieldIds ?? [
            relationFieldId,
            requiredValueFieldId,
            orderFieldId,
          ].filter((fieldId): fieldId is string => Boolean(fieldId)),
        },
      };
    }

    if (config.presentationMode === "LATEST_BY_RELATION") {
      return {
        type,
        entityTypeId: config.entityTypeId,
        timeFilter: config.timeFilter,
        valueDisplay: config.valueDisplay,
        presentationMode: "LATEST_BY_RELATION",
        latestByRelation: {
          relatedEntityTypeId: config.latestByRelation.relatedEntityTypeId,
          relationFieldId: config.latestByRelation.relationFieldId,
          orderFieldId: config.latestByRelation.orderFieldId,
          ...(config.latestByRelation.requiredValueFieldId ? { requiredValueFieldId: config.latestByRelation.requiredValueFieldId } : {}),
          displayFieldIds: config.latestByRelation.displayFieldIds,
        },
      };
    }

    if (config.presentationMode === "MATRIX") {
      return {
        type,
        entityTypeId: config.entityTypeId,
        dateFieldId: config.dateFieldId,
        timeFilter: config.timeFilter,
        valueDisplay: config.valueDisplay,
        presentationMode: "MATRIX",
        matrix: {
          rowFieldId: config.matrix.rowFieldId,
          columnFieldId: config.matrix.columnFieldId,
          valueFieldId: config.matrix.valueFieldId,
          ...(config.matrix.summaryFieldId ? { summaryFieldId: config.matrix.summaryFieldId } : {}),
        },
      };
    }

    throw new AppViewConfigError("La presentación del reporte no es compatible.", "presentationMode");
  }

  if (type === "BOARD") {
    const config = boardConfigInputSchema.parse(rawConfig);
    const entityType = await requireEntityType(client, contractId, config.entityTypeId);
    const field = entityType.fields.find((item) => item.key === config.groupByFieldKey);

    if (!field || !field.isActive) {
      throw new AppViewConfigError("Selecciona un campo activo válido para agrupar.");
    }

    return {
      type,
      entityTypeId: config.entityTypeId,
      groupByFieldKey: config.groupByFieldKey,
    };
  }

  if (type === "DASHBOARD") {
    const config = dashboardConfigInputSchema.parse(rawConfig);
    const uniqueEntityTypeIds = Array.from(new Set(config.entityTypeIds));

    for (const entityTypeId of uniqueEntityTypeIds) {
      await requireEntityType(client, contractId, entityTypeId);
    }

    return { type, entityTypeIds: uniqueEntityTypeIds };
  }

  const config = parsePanelConfigInput(rawConfig);
  await validatePanelAppViewConfig({ client, config, contractId });

  return { type, ...config };
}

const recordsConfigInputSchema = z.object({
  entityTypeId: z.string().trim().min(1, "Selecciona una entidad."),
});

const reportCommonConfigInputSchema = z.object({
  timeFilter: z.object({
    mode: z.enum(["RANGE", "MONTH"]),
    defaultPeriod: z.literal("CURRENT_MONTH"),
    allowChange: z.boolean(),
  }).default(defaultReportTimeFilter),
  valueDisplay: z.record(z.string(), z.enum(["LABEL", "INTERNAL_VALUE"])).default({}),
});

const reportEntityBaseConfigInputSchema = reportCommonConfigInputSchema.extend({
  sourceMode: z.literal("ENTITY").optional(),
  entityTypeId: z.string().trim().min(1, "Selecciona una entidad."),
  dateFieldId: z.string().trim().min(1, "Selecciona el campo de fecha."),
});

const reportCurrentStatusBaseConfigInputSchema = reportCommonConfigInputSchema.extend({
  sourceMode: z.literal("ENTITY").optional(),
  entityTypeId: z.string().trim().min(1, "Selecciona una entidad."),
});

const reportEntityConfigInputSchema = z.discriminatedUnion("presentationMode", [
  reportEntityBaseConfigInputSchema.extend({
    presentationMode: z.literal("TABLE"),
    table: z.object({
      visibleFieldIds: z.array(z.string().trim().min(1)).default([]),
      defaultSortFieldId: z.string().trim().optional().transform((value) => value || undefined),
      defaultSortDirection: z.enum(["asc", "desc"]).default("desc"),
    }),
  }),
  reportEntityBaseConfigInputSchema.extend({
    presentationMode: z.literal("MATRIX"),
    matrix: z.object({
      rowFieldId: z.string().trim().min(1, "Selecciona el campo de filas."),
      columnFieldId: z.string().trim().min(1, "Selecciona el campo de columnas."),
      valueFieldId: z.string().trim().min(1, "Selecciona el campo de valor."),
      summaryFieldId: z.string().trim().optional().transform((value) => value || undefined),
    }),
  }),
  reportCurrentStatusBaseConfigInputSchema.extend({
    presentationMode: z.literal("CURRENT_STATUS"),
    currentStatus: z.object({
      subjectFieldId: z.preprocess(
        (value) => value === null ? undefined : value,
        z.string().trim().optional().transform((value) => value || undefined),
      ),
      relationFieldId: z.preprocess(
        (value) => value === null ? undefined : value,
        z.string().trim().optional().transform((value) => value || undefined),
      ),
      stateFieldId: z.preprocess(
        (value) => value === null ? undefined : value,
        z.string().trim().optional().transform((value) => value || undefined),
      ),
      requiredValueFieldId: z.preprocess(
        (value) => value === null ? undefined : value,
        z.string().trim().optional().transform((value) => value || undefined),
      ),
      dateFieldId: z.preprocess(
        (value) => value === null ? undefined : value,
        z.string().trim().optional().transform((value) => value || undefined),
      ),
      orderFieldId: z.preprocess(
        (value) => value === null ? undefined : value,
        z.string().trim().optional().transform((value) => value || undefined),
      ),
      displayFieldIds: z.array(z.string().trim().min(1)).default([]),
    }),
  }),
  reportCurrentStatusBaseConfigInputSchema.extend({
    presentationMode: z.literal("LATEST_BY_RELATION"),
    latestByRelation: z.object({
      relatedEntityTypeId: z.string({ message: "Selecciona la entidad relacionada." }).trim().min(1, "Selecciona la entidad relacionada."),
      relationFieldId: z.string({ message: "Selecciona el campo de relación." }).trim().min(1, "Selecciona el campo de relación."),
      orderFieldId: z.string({ message: "Selecciona el campo de orden." }).trim().min(1, "Selecciona el campo de orden."),
      requiredValueFieldId: z.preprocess(
        (value) => value === null ? undefined : value,
        z.string().trim().optional().transform((value) => value || undefined),
      ),
      displayFieldIds: z.array(z.string().trim().min(1)).default([]),
    }),
  }),
]);

const reportStateUpdateConfigInputSchema = reportCommonConfigInputSchema.extend({
  sourceMode: z.literal("STATE_UPDATE"),
  stateUpdateAppViewId: z.string().trim().min(1, "Selecciona una experiencia de actualización de estado."),
  projection: z.literal("CURRENT"),
  presentationMode: z.literal("TABLE", {
    message: "Los reportes STATE_UPDATE solo soportan tabla en esta versión.",
  }),
  table: z.object({
    visibleFieldIds: z.array(z.string().trim().min(1)).default([]),
    defaultSortFieldId: z.string().trim().optional().transform((value) => value || undefined),
    defaultSortDirection: z.enum(["asc", "desc"]).default("asc"),
  }),
});

const reportConfigInputSchema = z.union([
  reportStateUpdateConfigInputSchema,
  reportEntityConfigInputSchema,
]);

const workflowBaseConfigInputSchema = z.object({
  workflowKey: z.enum(workflowKeys),
  sourceEntityTypeId: z.string().trim().min(1, "Selecciona una entidad fuente."),
  targetEntityTypeId: z.string().trim().min(1, "Selecciona una entidad destino."),
});

const attendanceWorkflowConfigInputSchema = workflowBaseConfigInputSchema.extend({
  workflowKey: z.literal("attendance"),
  personFieldId: z.string().trim().min(1, "Selecciona el campo Persona."),
  dateFieldId: z.string().trim().min(1, "Selecciona el campo Fecha."),
  statusFieldId: z.string().trim().min(1, "Selecciona el campo Estado."),
  defaultCheckInOptionId: z.preprocess(
    (value) => value === null ? undefined : value,
    z
      .string()
      .trim()
      .min(1, "Selecciona el estado por defecto de checking."),
  ),
  contextFieldIds: z.array(z.string().trim().min(1)).default([]),
  observationFieldId: z.preprocess(
    (value) => value === null ? undefined : value,
    z
      .string()
      .trim()
      .optional()
      .transform((value) => value || undefined),
  ),
});

const stateUpdateWorkflowConfigInputSchema = workflowBaseConfigInputSchema.extend({
  workflowKey: z.literal("state-update"),
  subjectFieldId: z.string().trim().min(1, "Selecciona el campo sujeto."),
  stateFields: z.array(z.object({
    defaultOptionId: z.string().trim().optional().transform((value) => value || undefined),
    fieldId: z.string().trim().min(1),
    required: z.boolean(),
  })).min(1, "Selecciona al menos un campo de estado."),
  extraFieldIds: z.array(z.string().trim().min(1)).default([]),
  dateFieldId: z.preprocess(
    (value) => value === null ? undefined : value,
    z.string().trim().optional().transform((value) => value || undefined),
  ),
  uniqueness: z.object({
    mode: z.enum(["none", "subject", "subject-date"]),
  }),
  historyMode: z.enum(["append", "update-current"]),
});

const boardConfigInputSchema = z.object({
  entityTypeId: z.string().trim().min(1, "Selecciona una entidad."),
  groupByFieldKey: z.string().trim().min(1, "Selecciona un campo para agrupar."),
});

const dashboardConfigInputSchema = z.object({
  entityTypeIds: z.array(z.string().trim().min(1)).min(1, "Selecciona al menos una entidad."),
});

const panelIdSchema = z.string().trim().min(1).regex(/^[A-Za-z0-9_-]+$/, "Usa solo letras, números, guiones y guiones bajos.");
const panelPaginationSchema = z.object({
  pageSize: z.number().int().min(1).max(100),
});
const panelFilterSchema = z.object({
  id: panelIdSchema,
  label: z.string().trim().min(1).optional(),
  valueType: z.enum(["TEXT", "NUMBER", "DATE", "BOOLEAN", "OPTION", "RECORD"]),
  required: z.boolean().optional(),
}).strict();
const panelFilterExprSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("FIELD_VALUE"),
    fieldId: z.string().trim().min(1),
    operator: z.enum(["EQ", "IN", "HAS_VALUE"]),
    value: z.unknown().optional(),
    values: z.array(z.unknown()).optional(),
  }).strict(),
  z.object({
    type: z.literal("PANEL_FILTER"),
    filterId: z.string().trim().min(1),
    fieldId: z.string().trim().min(1),
    operator: z.enum(["EQ", "IN"]),
  }).strict(),
]);
const panelSortSchema = z.object({
  fieldId: z.string().trim().min(1),
  direction: z.enum(["asc", "desc"]),
});
const panelMetricAggregationSchema = z.enum(["COUNT", "COUNT_VALUES", "COUNT_DISTINCT", "SUM", "AVG", "MIN", "MAX"]);
const panelPercentScaleSchema = z.enum(["RATIO", "WHOLE"]);
const panelDatasetSchema = z.object({
  id: panelIdSchema,
  name: z.string().trim().min(1).optional(),
  source: z.object({
    type: z.literal("ENTITY"),
    entityTypeId: z.string().trim().min(1),
  }).strict(),
  filters: z.array(panelFilterExprSchema).optional(),
  sort: z.array(panelSortSchema).optional(),
  transformation: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("RECORDS"),
      fieldIds: z.array(z.string().trim().min(1)).min(1),
      pagination: panelPaginationSchema.optional(),
    }),
    z.object({
      type: z.literal("LATEST_BY_RELATION"),
      relatedEntityTypeId: z.string().trim().min(1),
      relationFieldId: z.string().trim().min(1),
      orderFieldId: z.string().trim().min(1),
      requiredValueFieldId: z.string().trim().min(1).optional(),
      fieldIds: z.array(z.string().trim().min(1)).min(1),
      pagination: panelPaginationSchema.optional(),
    }),
  ]),
}).strict().superRefine((dataset, ctx) => {
  if (new Set(dataset.transformation.fieldIds).size !== dataset.transformation.fieldIds.length) {
    ctx.addIssue({
      code: "custom",
      message: "No repitas campos en el dataset.",
      path: ["transformation", "fieldIds"],
    });
  }
});
const panelTableModuleVisualizationSchema = z.object({
  type: z.literal("TABLE"),
  config: z.object({
    columns: z.array(z.object({
      fieldId: z.string().trim().min(1),
      label: z.string().trim().min(1).optional(),
      valueDisplay: z.enum(["LABEL", "INTERNAL_VALUE"]).optional(),
      format: z.string().trim().min(1).optional(),
    }).strict()).min(1, "Selecciona al menos una columna."),
    searchable: z.boolean().optional(),
    paginated: z.boolean().optional(),
  }).strict(),
}).strict();
const panelKpiConfigBaseSchema = {
  metricId: z.string().trim().min(1, "Selecciona una métrica para el KPI."),
  label: z.string().trim().min(1, "Escribe una etiqueta para el KPI."),
};
const panelKpiModuleVisualizationSchema = z.object({
  type: z.literal("KPI"),
  config: z.discriminatedUnion("format", [
    z.object({
      ...panelKpiConfigBaseSchema,
      format: z.enum(["NUMBER", "INTEGER", "DECIMAL", "DATE", "DATETIME"]),
    }).strict(),
    z.object({
      ...panelKpiConfigBaseSchema,
      format: z.literal("MONEY"),
      currencyCode: z.string()
        .trim()
        .regex(/^[A-Z]{3}$/, "Ingresa un código de moneda ISO 4217 de tres letras."),
    }).strict(),
    z.object({
      ...panelKpiConfigBaseSchema,
      format: z.literal("PERCENT"),
      percentScale: panelPercentScaleSchema,
    }).strict(),
  ]),
}).strict();
const panelMetricSchema = z.object({
  id: panelIdSchema,
  name: z.string().trim().min(1, "Escribe un nombre para la métrica."),
  datasetId: z.string().trim().min(1, "Selecciona un dataset para la métrica."),
  aggregation: panelMetricAggregationSchema,
  fieldId: z.preprocess(
    (value) => value === null ? undefined : value,
    z.string().trim().optional().transform((value) => value || undefined),
  ),
  filterIds: z.array(z.string().trim().min(1)).default([]),
}).strict();
const panelModuleSchema = z.object({
  id: panelIdSchema,
  title: z.string().trim().min(1).optional(),
  datasetId: z.string().trim().min(1),
  visualization: z.discriminatedUnion("type", [
    panelTableModuleVisualizationSchema,
    panelKpiModuleVisualizationSchema,
  ]),
  layout: z.object({
    x: z.number().int().min(0),
    y: z.number().int().min(0),
    w: z.number().int().min(1),
    h: z.number().int().min(1),
  }).strict(),
}).strict();
const panelConfigInputSchema = z.object({
  schemaVersion: z.literal(1),
  layout: z.object({
    columns: z.number().int().min(1).max(24),
    rowHeight: z.number().int().min(1).optional(),
  }).strict(),
  filters: z.array(panelFilterSchema),
  datasets: z.array(panelDatasetSchema).min(1),
  metrics: z.array(panelMetricSchema),
  calculatedFields: z.tuple([]),
  modules: z.array(panelModuleSchema).min(1),
}).strict().superRefine((config, ctx) => {
  addDuplicateIssues(config.filters.map((filter) => filter.id), ctx, "filters");
  addDuplicateIssues(config.datasets.map((dataset) => dataset.id), ctx, "datasets");
  addDuplicateIssues(config.metrics.map((metric) => metric.id), ctx, "metrics");
  addDuplicateIssues(config.modules.map((module) => module.id), ctx, "modules");

  const datasetIds = new Set(config.datasets.map((dataset) => dataset.id));
  const metricIds = new Set(config.metrics.map((metric) => metric.id));
  const filterIds = new Set(config.filters.map((filter) => filter.id));
  for (const [index, metric] of config.metrics.entries()) {
    if (!datasetIds.has(metric.datasetId)) {
      ctx.addIssue({
        code: "custom",
        message: "La métrica referencia un dataset inexistente.",
        path: ["metrics", index, "datasetId"],
      });
    }
    addDuplicateIssues(metric.filterIds, ctx, `metrics.${index}.filterIds`);
    for (const filterId of metric.filterIds) {
      if (!filterIds.has(filterId)) {
        ctx.addIssue({
          code: "custom",
          message: "La métrica referencia un filtro de panel inexistente.",
          path: ["metrics", index, "filterIds"],
        });
      }
    }
  }
  for (const [index, module] of config.modules.entries()) {
    if (!datasetIds.has(module.datasetId)) {
      ctx.addIssue({
        code: "custom",
        message: "El módulo referencia un dataset inexistente.",
        path: ["modules", index, "datasetId"],
      });
    }
    if (module.visualization.type === "TABLE") {
      addDuplicateIssues(
        module.visualization.config.columns.map((column) => column.fieldId),
        ctx,
        `modules.${index}.visualization.config.columns`,
      );
    }
    if (module.visualization.type === "KPI" && !metricIds.has(module.visualization.config.metricId)) {
      ctx.addIssue({
        code: "custom",
        message: "El KPI referencia una métrica inexistente.",
        path: ["modules", index, "visualization", "config", "metricId"],
      });
    }
    if (module.layout.x + module.layout.w > config.layout.columns) {
      ctx.addIssue({
        code: "custom",
        message: "El layout del módulo excede las columnas del panel.",
        path: ["modules", index, "layout"],
      });
    }
  }
});

function panelModuleLayoutOverlaps(modules: Array<Pick<PanelModule, "id" | "title" | "layout">>) {
  const overlaps: Array<{
    left: string;
    leftIndex: number;
    right: string;
  }> = [];

  for (let leftIndex = 0; leftIndex < modules.length; leftIndex += 1) {
    const left = modules[leftIndex];
    if (!left) continue;

    for (let rightIndex = leftIndex + 1; rightIndex < modules.length; rightIndex += 1) {
      const right = modules[rightIndex];
      if (!right) continue;

      if (panelModuleLayoutsOverlap(left.layout, right.layout)) {
        overlaps.push({
          left: left.title || left.id,
          leftIndex,
          right: right.title || right.id,
        });
      }
    }
  }

  return overlaps;
}

function panelModuleLayoutsOverlap(
  left: Pick<PanelModule["layout"], "x" | "y" | "w" | "h">,
  right: Pick<PanelModule["layout"], "x" | "y" | "w" | "h">,
) {
  return left.x < right.x + right.w &&
    left.x + left.w > right.x &&
    left.y < right.y + right.h &&
    left.y + left.h > right.y;
}

function parseRecordsConfigInput(rawConfig: unknown) {
  return recordsConfigInputSchema.parse(rawConfig);
}

function parsePanelConfigInput(rawConfig: unknown) {
  if (isRecord(rawConfig) && typeof rawConfig.panelConfig === "string") {
    try {
      return parsePanelConfigObject(JSON.parse(rawConfig.panelConfig));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new AppViewConfigError("La configuración del panel no es válida.", "panelConfig");
      }

      throw error;
    }
  }

  return parsePanelConfigObject(rawConfig);
}

function parsePanelConfigObject(rawConfig: unknown) {
  const result = panelConfigInputSchema.safeParse(rawConfig);

  if (!result.success) {
    if (result.error.issues.some((issue) => issue.code === "unrecognized_keys")) {
      throw new AppViewConfigError(
        "La configuración del panel contiene propiedades no soportadas.",
        "panelConfig",
      );
    }

    throw result.error;
  }

  return result.data;
}

function addDuplicateIssues(ids: string[], ctx: z.RefinementCtx, path: string) {
  const seen = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) {
      ctx.addIssue({
        code: "custom",
        message: "No repitas identificadores en esta configuración.",
        path: [path],
      });
      return;
    }
    seen.add(id);
  }
}

async function requireEntityType(
  client: PrismaClientLike,
  contractId: string,
  entityTypeId: string,
) {
  const entityType = await client.entityType.findFirst({
    include: {
      fields: {
        select: {
          config: true,
          id: true,
          isActive: true,
          key: true,
          multiple: true,
          name: true,
          options: {
            select: {
              id: true,
              isActive: true,
              label: true,
              value: true,
            },
          },
          type: true,
        },
      },
    },
    where: {
      contractId,
      id: entityTypeId,
      isActive: true,
    },
  });

  if (!entityType) {
    throw new AppViewConfigError("La vista referencia una entidad que no pertenece a este contrato.");
  }

  return entityType;
}

async function requireStateUpdateReportSource(
  client: PrismaClientLike,
  contractId: string,
  appViewId: string,
) {
  const appView = await client.appView.findFirst({
    where: {
      active: true,
      contractId,
      id: appViewId,
      type: "WORKFLOW",
    },
  });

  if (!appView) {
    throw new AppViewConfigError(
      "La experiencia STATE_UPDATE del reporte no está disponible.",
      "stateUpdateAppViewId",
    );
  }

  return appView;
}

function parseWorkflowConfigInput(rawConfig: unknown) {
  if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    return z.discriminatedUnion("workflowKey", [
      attendanceWorkflowConfigInputSchema,
      stateUpdateWorkflowConfigInputSchema,
    ]).parse(rawConfig);
  }

  const raw = rawConfig as Record<string, unknown>;
  const workflowKey = raw.workflowKey ?? raw.workflow;

  if (workflowKey === "state-update") {
    const stateFieldIds = stringArray(raw.stateFieldIds ?? raw.stateFields);
    const requiredStateFieldIds = new Set(stringArray(raw.requiredStateFieldIds));
    const defaultOptions = isRecord(raw.stateFieldDefaultOptions)
      ? raw.stateFieldDefaultOptions
      : {};

    return stateUpdateWorkflowConfigInputSchema.parse({
      ...raw,
      workflowKey,
      extraFieldIds: stringArray(raw.extraFieldIds),
      historyMode: raw.historyMode ?? "append",
      stateFields: Array.isArray(raw.stateFields) && raw.stateFields.every(isRecord)
        ? raw.stateFields
        : stateFieldIds.map((fieldId) => ({
            fieldId,
            required: requiredStateFieldIds.has(fieldId),
            defaultOptionId: defaultOptions[fieldId],
          })),
      uniqueness: isRecord(raw.uniqueness)
        ? raw.uniqueness
        : { mode: raw.uniquenessMode ?? "none" },
    });
  }

  return attendanceWorkflowConfigInputSchema.parse({
    ...raw,
    contextFieldIds: uniqueStrings(stringArray(raw.contextFieldIds)),
    defaultCheckInOptionId: raw.defaultCheckInOptionId ?? raw.presentOptionId,
    workflowKey,
  });
}

function parseReportConfigInput(rawConfig: unknown) {
  if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    return reportConfigInputSchema.parse(rawConfig);
  }

  const raw = rawConfig as Record<string, unknown>;
  const sourceMode = raw.sourceMode ?? raw.reportSourceMode ?? "ENTITY";

  if (sourceMode === "STATE_UPDATE") {
    return reportConfigInputSchema.parse({
      stateUpdateAppViewId: raw.stateUpdateAppViewId,
      projection: raw.projection ?? raw.reportProjection ?? "CURRENT",
      sourceMode,
      timeFilter: parseReportTimeFilter(raw),
      valueDisplay: parseReportValueDisplay(raw),
      presentationMode: raw.presentationMode ?? "TABLE",
      table: {
        visibleFieldIds: uniqueStrings(stringArray(raw.visibleFieldIds ?? (isRecord(raw.table) ? raw.table.visibleFieldIds : []))),
        defaultSortFieldId: raw.defaultSortFieldId ?? (isRecord(raw.table) ? raw.table.defaultSortFieldId : undefined),
        defaultSortDirection: raw.defaultSortDirection ?? (isRecord(raw.table) ? raw.table.defaultSortDirection : undefined) ?? "asc",
      },
    });
  }

  const presentationMode = raw.presentationMode === "MATRIX"
    ? "MATRIX"
    : raw.presentationMode === "CURRENT_STATUS" || raw.presentationMode === "LATEST_BY_RELATION"
      ? raw.presentationMode
      : "TABLE";

  if (presentationMode === "MATRIX") {
    const matrix = isRecord(raw.matrix) ? raw.matrix : {};

    return reportConfigInputSchema.parse({
      entityTypeId: raw.entityTypeId,
      dateFieldId: raw.dateFieldId,
      timeFilter: parseReportTimeFilter(raw),
      valueDisplay: parseReportValueDisplay(raw),
      presentationMode,
      matrix: {
        rowFieldId: raw.reportRowFieldId ?? matrix.rowFieldId,
        columnFieldId: raw.reportColumnFieldId ?? matrix.columnFieldId,
        valueFieldId: raw.reportValueFieldId ?? matrix.valueFieldId,
        ...((raw.reportSummaryFieldId ?? matrix.summaryFieldId)
          ? { summaryFieldId: raw.reportSummaryFieldId ?? matrix.summaryFieldId }
          : {}),
      },
    });
  }

  if (presentationMode === "CURRENT_STATUS" || presentationMode === "LATEST_BY_RELATION") {
    if (presentationMode === "LATEST_BY_RELATION") {
      const latestByRelation = isRecord(raw.latestByRelation) ? raw.latestByRelation : {};
      const relatedEntityTypeId = raw.latestByRelationRelatedEntityTypeId ?? latestByRelation.relatedEntityTypeId;
      const relationFieldId = raw.latestByRelationRelationFieldId ?? latestByRelation.relationFieldId;
      const orderFieldId = raw.latestByRelationOrderFieldId ?? latestByRelation.orderFieldId;
      const requiredValueFieldId = raw.latestByRelationRequiredValueFieldId ?? latestByRelation.requiredValueFieldId;
      const displayFieldIds = uniqueStrings(stringArray(raw.displayFieldIds ?? latestByRelation.displayFieldIds));

      return reportConfigInputSchema.parse({
        entityTypeId: raw.entityTypeId,
        timeFilter: parseReportTimeFilter(raw),
        valueDisplay: parseReportValueDisplay(raw),
        presentationMode,
        latestByRelation: {
          relatedEntityTypeId,
          relationFieldId,
          orderFieldId,
          requiredValueFieldId,
          displayFieldIds,
        },
      });
    }

    const currentStatus = isRecord(raw.currentStatus) ? raw.currentStatus : {};
    const relationFieldId = raw.currentStatusRelationFieldId ?? raw.currentStatusSubjectFieldId ?? currentStatus.relationFieldId ?? currentStatus.subjectFieldId;
    const requiredValueFieldId = raw.currentStatusRequiredValueFieldId ?? raw.currentStatusStateFieldId ?? currentStatus.requiredValueFieldId ?? currentStatus.stateFieldId;
    const orderFieldId = raw.currentStatusOrderFieldId ?? raw.currentStatusDateFieldId ?? currentStatus.orderFieldId ?? currentStatus.dateFieldId;
    const displayFieldIds = uniqueStrings(stringArray(
      raw.displayFieldIds ??
        currentStatus.displayFieldIds ??
        [relationFieldId, requiredValueFieldId, orderFieldId].filter(Boolean),
    ));

    return reportConfigInputSchema.parse({
      entityTypeId: raw.entityTypeId,
      timeFilter: parseReportTimeFilter(raw),
      valueDisplay: parseReportValueDisplay(raw),
      presentationMode,
      currentStatus: {
        subjectFieldId: relationFieldId,
        relationFieldId,
        stateFieldId: requiredValueFieldId,
        requiredValueFieldId,
        dateFieldId: orderFieldId,
        orderFieldId,
        displayFieldIds,
      },
    });
  }

  const table = isRecord(raw.table) ? raw.table : {};

  return reportConfigInputSchema.parse({
    entityTypeId: raw.entityTypeId,
    dateFieldId: raw.dateFieldId,
    timeFilter: parseReportTimeFilter(raw),
    valueDisplay: parseReportValueDisplay(raw),
    presentationMode,
    table: {
      visibleFieldIds: uniqueStrings(stringArray(raw.visibleFieldIds ?? table.visibleFieldIds)),
      defaultSortFieldId: raw.defaultSortFieldId ?? table.defaultSortFieldId,
      defaultSortDirection: raw.defaultSortDirection ?? table.defaultSortDirection ?? "desc",
    },
  });
}

function parseReportTimeFilter(raw: Record<string, unknown>) {
  const stored = isRecord(raw.timeFilter) ? raw.timeFilter : {};
  const mode = raw.reportTimeMode ?? stored.mode ?? defaultReportTimeFilter.mode;
  const defaultPeriod = raw.reportTimeDefaultPeriod ?? stored.defaultPeriod ?? defaultReportTimeFilter.defaultPeriod;
  const allowChange = typeof raw.reportTimeAllowChange === "boolean"
    ? raw.reportTimeAllowChange
    : typeof stored.allowChange === "boolean"
      ? stored.allowChange
      : defaultReportTimeFilter.allowChange;

  return { allowChange, defaultPeriod, mode };
}

function parseReportValueDisplay(raw: Record<string, unknown>) {
  const stored = isRecord(raw.valueDisplay) ? raw.valueDisplay : {};
  const submitted = isRecord(raw.reportValueDisplay) ? raw.reportValueDisplay : {};
  const source = Object.keys(submitted).length > 0 ? submitted : stored;
  const entries = Object.entries(source).filter((entry): entry is [string, ReportSelectValueDisplay] =>
    typeof entry[0] === "string" &&
    (entry[1] === "LABEL" || entry[1] === "INTERNAL_VALUE"),
  );

  return Object.fromEntries(entries);
}

async function validatePanelAppViewConfig({
  client,
  config,
  contractId,
}: {
  client: PrismaClientLike;
  config: z.infer<typeof panelConfigInputSchema>;
  contractId: string;
}) {
  const filtersById = new Map(config.filters.map((filter) => [filter.id, filter]));
  const datasetFieldIdsById = new Map<string, Set<string>>();
  const datasetFieldsById = new Map<string, Map<string, { id: string; isActive: boolean; name: string; type: string }>>();
  const datasetFiltersById = new Map<string, Set<string>>();
  const datasetNamesById = new Map<string, string>();
  const fieldNamesById = new Map<string, string>();
  const layoutOverlap = panelModuleLayoutOverlaps(config.modules)[0];

  if (layoutOverlap) {
    throw new AppViewConfigError(
      `Los módulos ${layoutOverlap.left} y ${layoutOverlap.right} se solapan en el layout.`,
      "layout",
    );
  }

  for (const dataset of config.datasets) {
    const entityType = await requireEntityType(client, contractId, dataset.source.entityTypeId);
    const fields = entityType.fields;
    const fieldIds = dataset.transformation.fieldIds;

    datasetNamesById.set(dataset.id, dataset.name ?? entityType.name);
    datasetFiltersById.set(dataset.id, new Set((dataset.filters ?? [])
      .filter((filter) => filter.type === "PANEL_FILTER")
      .map((filter) => filter.filterId)));
    for (const field of fields) {
      fieldNamesById.set(field.id, field.name);
    }

    requireUniqueConfigIds(fieldIds, "No repitas campos en el dataset.", "datasets");

    for (const fieldId of fieldIds) {
      requireActiveTargetField(fields, fieldId, "campos del dataset");
    }

    for (const filter of dataset.filters ?? []) {
      const field = requireActiveTargetField(fields, filter.fieldId, "filtros del dataset");

      if (filter.type === "PANEL_FILTER") {
        const panelFilter = filtersById.get(filter.filterId);

        if (!panelFilter) {
          throw new AppViewConfigError("El dataset referencia un filtro de panel inexistente.", "filters");
        }

        if (!panelFilterValueTargetsField(panelFilter.valueType, field.type)) {
          throw new AppViewConfigError("El filtro de panel no es compatible con el campo enlazado.", "filters");
        }
      }
    }

    for (const sort of dataset.sort ?? []) {
      const sortField = requireActiveTargetField(fields, sort.fieldId, "orden del dataset");

      if (!reportSortableFieldTypes.has(sortField.type)) {
        throw new AppViewConfigError("El campo de orden del dataset no es compatible.", "datasets");
      }
    }

    if (dataset.transformation.type === "LATEST_BY_RELATION") {
      await requireEntityType(client, contractId, dataset.transformation.relatedEntityTypeId);
      const relationField = requireActiveTargetField(fields, dataset.transformation.relationFieldId, "relación del dataset");

      if (relationField.type !== "RELATION") {
        throw new AppViewConfigError("relationFieldId debe ser un campo RELATION.", "datasets");
      }

      if (getRelationConfig(relationField.config).targetEntityTypeId !== dataset.transformation.relatedEntityTypeId) {
        throw new AppViewConfigError("relationFieldId debe apuntar a relatedEntityTypeId.", "datasets");
      }

      const orderField = requireActiveTargetField(fields, dataset.transformation.orderFieldId, "orden del dataset");

      if (!reportSortableFieldTypes.has(orderField.type)) {
        throw new AppViewConfigError("orderFieldId no es compatible para ordenar.", "datasets");
      }

      if (dataset.transformation.requiredValueFieldId) {
        requireActiveTargetField(fields, dataset.transformation.requiredValueFieldId, "campo requerido del dataset");
      }
    }

    datasetFieldIdsById.set(dataset.id, new Set(fieldIds));
    datasetFieldsById.set(dataset.id, new Map(fields.map((field) => [field.id, field])));
  }

  for (const metric of config.metrics) {
    const datasetFieldIds = datasetFieldIdsById.get(metric.datasetId);
    const datasetFields = datasetFieldsById.get(metric.datasetId);
    const datasetFilterIds = datasetFiltersById.get(metric.datasetId) ?? new Set<string>();
    const metricName = metric.name || metric.id;

    if (!datasetFieldIds || !datasetFields) {
      throw new AppViewConfigError("La métrica referencia un dataset inexistente.", "metrics");
    }

    for (const filterId of metric.filterIds) {
      if (!filtersById.has(filterId)) {
        throw new AppViewConfigError("La métrica referencia un filtro de panel inexistente.", "metrics");
      }
      if (!datasetFilterIds.has(filterId)) {
        throw new AppViewConfigError("La métrica referencia un filtro que no aplica a su dataset.", "metrics");
      }
    }

    if (metric.aggregation === "COUNT") {
      if (metric.fieldId) {
        throw new AppViewConfigError(`La métrica ${metricName} no debe seleccionar campo para COUNT.`, "metrics");
      }
      continue;
    }

    if (!metric.fieldId) {
      throw new AppViewConfigError(`Selecciona un campo para la métrica ${metricName}.`, "metrics");
    }

    if (!datasetFieldIds.has(metric.fieldId)) {
      throw new AppViewConfigError(`El campo de la métrica ${metricName} no pertenece al dataset.`, "metrics");
    }

    const field = datasetFields.get(metric.fieldId);

    if (!field?.isActive) {
      throw new AppViewConfigError(`El campo de la métrica ${metricName} no está activo.`, "metrics");
    }

    if (!panelMetricAggregationTargetsField(metric.aggregation, field.type)) {
      throw new AppViewConfigError(`La agregación ${metric.aggregation} no es compatible con el campo ${field.name}.`, "metrics");
    }
  }

  const unresolvedColumnFieldIds = config.modules
    .flatMap((module) => module.visualization.type === "TABLE"
      ? module.visualization.config.columns.map((column) => column.fieldId)
      : [])
    .filter((fieldId) => !fieldNamesById.has(fieldId));

  if (unresolvedColumnFieldIds.length > 0) {
    const entityTypes = await client.entityType.findMany({
      include: {
        fields: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      where: { contractId },
    });

    for (const entityType of entityTypes) {
      for (const field of entityType.fields) {
        fieldNamesById.set(field.id, field.name);
      }
    }
  }

  for (const panelModule of config.modules) {
    const datasetFieldIds = datasetFieldIdsById.get(panelModule.datasetId);

    if (!datasetFieldIds) {
      throw new AppViewConfigError("El módulo referencia un dataset inexistente.", "modules");
    }

    if (panelModule.visualization.type === "TABLE") {
      for (const column of panelModule.visualization.config.columns) {
        if (!datasetFieldIds.has(column.fieldId)) {
          const moduleName = panelModule.title ?? panelModule.id;
          const columnName = column.label ?? fieldNamesById.get(column.fieldId) ?? column.fieldId;
          const datasetName = datasetNamesById.get(panelModule.datasetId) ?? panelModule.datasetId;

          throw new AppViewConfigError(
            `La columna ${columnName} no pertenece al dataset ${datasetName} en el módulo ${moduleName}.`,
            "modules",
          );
        }
      }
    }

    if (panelModule.visualization.type === "KPI") {
      const metricId = panelModule.visualization.config.metricId;
      const metric = config.metrics.find((item) => item.id === metricId);

      if (!metric) {
        throw new AppViewConfigError("El KPI referencia una métrica inexistente.", "modules");
      }

      if (metric.datasetId !== panelModule.datasetId) {
        throw new AppViewConfigError("El KPI debe usar una métrica del mismo dataset.", "modules");
      }

      const metricField = metric.fieldId
        ? datasetFieldsById.get(metric.datasetId)?.get(metric.fieldId)
        : undefined;

      if (!panelKpiFormatTargetsMetric(panelModule.visualization.config.format, metric, metricField?.type)) {
        throw new AppViewConfigError("El formato del KPI no es compatible con la métrica seleccionada.", "modules");
      }
    }
  }
}

function requireUniqueConfigIds(ids: string[], message: string, fieldName?: string) {
  if (new Set(ids).size !== ids.length) {
    throw new AppViewConfigError(message, fieldName);
  }
}

function panelFilterValueTargetsField(valueType: PanelFilter["valueType"], fieldType: string) {
  if (valueType === "TEXT") {
    return ["TEXT", "TEXTAREA", "EMAIL", "PHONE", "URL", "TIME"].includes(fieldType);
  }
  if (valueType === "NUMBER") {
    return ["INTEGER", "DECIMAL", "MONEY"].includes(fieldType);
  }
  if (valueType === "DATE") {
    return ["DATE", "DATETIME"].includes(fieldType);
  }
  if (valueType === "BOOLEAN") {
    return fieldType === "BOOLEAN";
  }
  if (valueType === "OPTION") {
    return ["SELECT", "MULTISELECT"].includes(fieldType);
  }

  return fieldType === "RELATION";
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

function panelKpiFormatTargetsMetric(
  format: PanelKpiFormat,
  metric: Pick<PanelMetric, "aggregation">,
  fieldType: string | undefined,
) {
  if ((metric.aggregation === "MIN" || metric.aggregation === "MAX") && fieldType === "DATE") {
    return format === "DATE";
  }
  if ((metric.aggregation === "MIN" || metric.aggregation === "MAX") && fieldType === "DATETIME") {
    return format === "DATETIME";
  }

  return ["NUMBER", "INTEGER", "DECIMAL", "MONEY", "PERCENT"].includes(format);
}

function validateReportAppViewFields({
  config,
  fields,
}: {
  config: z.infer<typeof reportEntityConfigInputSchema>;
  fields: Array<{
    config: unknown;
    id: string;
    isActive: boolean;
    name: string;
    type: string;
  }>;
}) {
  if (config.presentationMode === "CURRENT_STATUS") {
    const relationFieldId = config.currentStatus.relationFieldId ?? config.currentStatus.subjectFieldId;
    const requiredValueFieldId = config.currentStatus.requiredValueFieldId ?? config.currentStatus.stateFieldId;
    const orderFieldId = config.currentStatus.orderFieldId ?? config.currentStatus.dateFieldId;
    const displayFieldIds = config.currentStatus.displayFieldIds ?? [
      relationFieldId,
      requiredValueFieldId,
      orderFieldId,
    ].filter((fieldId): fieldId is string => Boolean(fieldId));

    if (!relationFieldId) {
      throw new AppViewConfigError("Selecciona el campo de registro relacionado.", "currentStatusRelationFieldId");
    }

    const relationField = requireActiveTargetField(fields, relationFieldId, "Registro relacionado");

    if (relationField.type !== "RELATION") {
      throw new AppViewConfigError("El campo de registro relacionado debe ser de tipo relación.", "currentStatusRelationFieldId");
    }

    if (requiredValueFieldId) {
      requireActiveTargetField(fields, requiredValueFieldId, "Campo requerido");
    }

    if (orderFieldId) {
      const orderField = requireActiveTargetField(fields, orderFieldId, "Orden");

      if (!reportSortableFieldTypes.has(orderField.type)) {
        throw new AppViewConfigError("El campo de orden no es compatible.", "currentStatusOrderFieldId");
      }
    }

    if (displayFieldIds.length === 0) {
      throw new AppViewConfigError("Selecciona al menos una columna visible.", "displayFieldIds");
    }

    for (const fieldId of displayFieldIds) {
      requireActiveTargetField(fields, fieldId, "Columnas visibles");
    }

    validateReportValueDisplayFields(config.valueDisplay, fields);

    return;
  }

  if (config.presentationMode === "LATEST_BY_RELATION") {
    const { displayFieldIds, orderFieldId, relatedEntityTypeId, relationFieldId, requiredValueFieldId } = config.latestByRelation;
    const relationField = requireActiveTargetField(fields, relationFieldId, "Registro relacionado");

    if (relationField.type !== "RELATION") {
      throw new AppViewConfigError("El campo de registro relacionado debe ser de tipo relación.", "latestByRelationRelationFieldId");
    }

    const relationTargetEntityTypeId = getRelationConfig(relationField.config).targetEntityTypeId;

    if (relationTargetEntityTypeId !== relatedEntityTypeId) {
      throw new AppViewConfigError("El campo de relación debe apuntar a la entidad relacionada seleccionada.", "latestByRelationRelationFieldId");
    }

    const orderField = requireActiveTargetField(fields, orderFieldId, "Orden");

    if (!reportSortableFieldTypes.has(orderField.type)) {
      throw new AppViewConfigError("El campo de orden no es compatible.", "latestByRelationOrderFieldId");
    }

    if (requiredValueFieldId) {
      requireActiveTargetField(fields, requiredValueFieldId, "Campo requerido");
    }

    if (displayFieldIds.length === 0) {
      throw new AppViewConfigError("Selecciona al menos una columna visible.", "displayFieldIds");
    }

    for (const fieldId of displayFieldIds) {
      requireActiveTargetField(fields, fieldId, "Columnas visibles");
    }

    validateReportValueDisplayFields(config.valueDisplay, fields);

    return;
  }

  if (config.presentationMode === "TABLE") {
    const dateField = requireActiveTargetField(fields, config.dateFieldId, "Fecha");

    if (!reportDateFieldTypes.has(dateField.type)) {
      throw new AppViewConfigError("El campo de fecha debe ser de tipo fecha.", "dateFieldId");
    }

    if (config.table.visibleFieldIds.length === 0) {
      throw new AppViewConfigError("Selecciona al menos una columna visible.", "visibleFieldIds");
    }

    for (const fieldId of config.table.visibleFieldIds) {
      requireActiveTargetField(fields, fieldId, "Columnas visibles");
    }

    if (config.table.defaultSortFieldId) {
      const sortField = requireActiveTargetField(fields, config.table.defaultSortFieldId, "Orden");

      if (!reportSortableFieldTypes.has(sortField.type)) {
        throw new AppViewConfigError("El campo de orden no es compatible.", "defaultSortFieldId");
      }
    }

    validateReportValueDisplayFields(config.valueDisplay, fields);

    return;
  }

  if (config.presentationMode === "MATRIX") {
    const dateField = requireActiveTargetField(fields, config.dateFieldId, "Fecha");

    if (!reportDateFieldTypes.has(dateField.type)) {
      throw new AppViewConfigError("El campo de fecha debe ser de tipo fecha.", "dateFieldId");
    }

    requireActiveTargetField(fields, config.matrix.rowFieldId, "Filas");
    requireActiveTargetField(fields, config.matrix.columnFieldId, "Columnas");
    requireActiveTargetField(fields, config.matrix.valueFieldId, "Valor");

    if (config.matrix.summaryFieldId) {
      requireActiveTargetField(fields, config.matrix.summaryFieldId, "Resumen lateral");
    }

    validateReportValueDisplayFields(config.valueDisplay, fields);
  }
}

function validateStateUpdateReportTableFields(
  config: z.infer<typeof reportStateUpdateConfigInputSchema>,
  stateUpdateConfig: StateUpdateWorkflowConfig,
) {
  if (config.table.visibleFieldIds.length === 0) {
    throw new AppViewConfigError("Selecciona al menos una columna visible.", "visibleFieldIds");
  }

  const validFieldIds = stateUpdateCurrentReportFieldIds(stateUpdateConfig);

  for (const fieldId of config.table.visibleFieldIds) {
    if (!validFieldIds.has(fieldId)) {
      throw new AppViewConfigError(
        "Las columnas del reporte STATE_UPDATE deben venir del sujeto o de sus campos de estado.",
        "visibleFieldIds",
      );
    }
  }

  if (config.table.defaultSortFieldId && !validFieldIds.has(config.table.defaultSortFieldId)) {
    throw new AppViewConfigError(
      "El orden del reporte STATE_UPDATE debe usar una columna virtual disponible.",
      "defaultSortFieldId",
    );
  }
}

function stateUpdateCurrentReportFieldIds(config: StateUpdateWorkflowConfig) {
  return new Set([
    "subject.displayName",
    "current.updatedAt",
    ...config.stateFields.map((field) => `state:${field.fieldId}`),
  ]);
}

function validateReportValueDisplayFields(
  valueDisplay: Record<string, ReportSelectValueDisplay>,
  fields: Array<{
    id: string;
    isActive: boolean;
    name: string;
    type: string;
  }>,
) {
  for (const fieldId of Object.keys(valueDisplay)) {
    const field = requireActiveTargetField(fields, fieldId, "Mostrar valores como");

    if (field.type !== "SELECT" && field.type !== "MULTISELECT") {
      throw new AppViewConfigError("La presentación de valores solo aplica a campos de selección.", "reportValueDisplay");
    }
  }
}

function validateAttendanceAppViewFields({
  config,
  sourceEntityType,
  targetEntityType,
  targetFields,
}: {
  config: z.infer<typeof attendanceWorkflowConfigInputSchema>;
  sourceEntityType: { id: string; name: string };
  targetEntityType: { id: string; name: string };
  targetFields: Array<{
    config: Prisma.JsonValue | null;
    id: string;
    isActive: boolean;
    multiple: boolean;
    name: string;
    options: Array<{ id: string; isActive: boolean; value: string }>;
    type: string;
  }>;
}) {
  const personField = requireActiveTargetField(targetFields, config.personFieldId, "Persona");
  const dateField = requireActiveTargetField(targetFields, config.dateFieldId, "Fecha");
  const statusField = requireActiveTargetField(targetFields, config.statusFieldId, "Estado");
  const observationField = config.observationFieldId
    ? requireActiveTargetField(targetFields, config.observationFieldId, "Observación")
    : null;
  const semanticFieldIds = new Set([
    config.personFieldId,
    config.dateFieldId,
    config.statusFieldId,
    config.observationFieldId,
  ].filter(Boolean));

  if (personField.type !== "RELATION") {
    throw new AppViewConfigError("El campo Persona debe ser de tipo relación.", "personFieldId");
  }

  if (!fieldRelationTargetsEntity(personField.config, sourceEntityType.id)) {
    logAttendanceValidationIssue("person_relation_target", {
      actualTargetEntityTypeId: getRelationConfig(personField.config).targetEntityTypeId ?? null,
      expectedSourceEntityTypeId: sourceEntityType.id,
      personFieldId: personField.id,
      targetEntityTypeId: targetEntityType.id,
    });
    throw new AppViewConfigError(
      `Este campo debe relacionar ${targetEntityType.name} con ${sourceEntityType.name}.`,
      "personFieldId",
    );
  }

  if (getRelationConfig(personField.config).relationKind !== "ONE") {
    logAttendanceValidationIssue("person_relation_kind", {
      actualRelationKind: getRelationConfig(personField.config).relationKind,
      personFieldId: personField.id,
      targetEntityTypeId: targetEntityType.id,
    });
    throw new AppViewConfigError("El campo Persona debe ser una relación simple.", "personFieldId");
  }

  if (dateField.type !== "DATE") {
    throw new AppViewConfigError("El campo Fecha debe ser de tipo fecha.", "dateFieldId");
  }

  if (statusField.type !== "SELECT") {
    throw new AppViewConfigError("El campo Estado debe ser de tipo selección.", "statusFieldId");
  }

  if (statusField.multiple) {
    throw new AppViewConfigError("El campo Estado debe ser de selección simple.", "statusFieldId");
  }

  requireActiveStatusOption(statusField, config.defaultCheckInOptionId);

  if (observationField && observationField.type !== "TEXTAREA") {
    throw new AppViewConfigError("El campo Observación debe ser de tipo texto largo.", "observationFieldId");
  }

  for (const contextFieldId of config.contextFieldIds) {
    if (semanticFieldIds.has(contextFieldId)) {
      throw new AppViewConfigError(
        "Los campos de contexto no deben repetir Persona, Fecha, Estado ni Observación.",
        "contextFieldIds",
      );
    }

    const contextField = requireActiveTargetField(targetFields, contextFieldId, "Contexto");

    if (contextField.type !== "SELECT" || contextField.multiple) {
      throw new AppViewConfigError(
        "Los campos de contexto deben ser selección simple.",
        "contextFieldIds",
      );
    }
  }
}

function validateStateUpdateAppViewFields({
  config,
  sourceEntityType,
  targetFields,
}: {
  config: z.infer<typeof stateUpdateWorkflowConfigInputSchema>;
  sourceEntityType: { id: string; name: string };
  targetFields: Array<{
    config: Prisma.JsonValue | null;
    id: string;
    isActive: boolean;
    multiple: boolean;
    name: string;
    options: Array<{ id: string; isActive: boolean }>;
    type: string;
  }>;
}) {
  const subjectField = requireActiveTargetField(targetFields, config.subjectFieldId, "Sujeto");

  if (subjectField.type !== "RELATION") {
    throw new AppViewConfigError("El campo sujeto debe ser de tipo relación.", "subjectFieldId");
  }

  if (!fieldRelationTargetsEntity(subjectField.config, sourceEntityType.id)) {
    throw new AppViewConfigError(
      `El campo sujeto debe relacionar con ${sourceEntityType.name}.`,
      "subjectFieldId",
    );
  }

  if (getRelationConfig(subjectField.config).relationKind !== "ONE") {
    throw new AppViewConfigError("El campo sujeto debe ser una relación simple.", "subjectFieldId");
  }

  const stateFieldIds = new Set<string>();
  for (const stateField of config.stateFields) {
    if (stateFieldIds.has(stateField.fieldId)) {
      throw new AppViewConfigError("No repitas campos de estado.", "stateFieldIds");
    }
    stateFieldIds.add(stateField.fieldId);
    const field = requireActiveTargetField(targetFields, stateField.fieldId, "Estado");

    if (!stateUpdateStateFieldTypes.has(field.type) || field.multiple) {
      throw new AppViewConfigError("Ese tipo de campo de estado no está soportado.", "stateFieldIds");
    }

    if (stateField.defaultOptionId) {
      if (field.type !== "SELECT") {
        throw new AppViewConfigError("La opción por defecto solo aplica a campos de estado SELECT.", "stateFieldIds");
      }

      const option = field.options.find((item) => item.id === stateField.defaultOptionId);
      if (!option || !option.isActive) {
        throw new AppViewConfigError("La opción por defecto debe pertenecer al campo de estado y estar activa.");
      }
    }
  }

  if (config.dateFieldId) {
    const dateField = requireActiveTargetField(targetFields, config.dateFieldId, "Fecha");
    if (dateField.type !== "DATE") {
      throw new AppViewConfigError("El campo Fecha debe ser de tipo fecha.", "dateFieldId");
    }
  }

  if (config.uniqueness.mode === "subject-date" && !config.dateFieldId) {
    throw new AppViewConfigError("La unicidad sujeto-fecha requiere un campo Fecha.", "dateFieldId");
  }

  const configuredFieldIds = new Set([
    config.subjectFieldId,
    config.dateFieldId,
    ...config.stateFields.map((field) => field.fieldId),
  ].filter(Boolean));
  const extraFieldIds = new Set<string>();
  for (const extraFieldId of config.extraFieldIds) {
    if (extraFieldIds.has(extraFieldId)) {
      throw new AppViewConfigError("No repitas campos extra.", "extraFieldIds");
    }
    extraFieldIds.add(extraFieldId);

    if (configuredFieldIds.has(extraFieldId)) {
      throw new AppViewConfigError("Los campos extra no deben repetir sujeto, fecha ni estados.", "extraFieldIds");
    }
    const field = requireActiveTargetField(targetFields, extraFieldId, "Campo extra");
    if (!stateUpdateExtraFieldTypes.has(field.type)) {
      throw new AppViewConfigError("Ese tipo de campo extra no está soportado.", "extraFieldIds");
    }
  }
}

const stateUpdateStateFieldTypes = new Set([
  "TEXT",
  "INTEGER",
  "DECIMAL",
  "MONEY",
  "BOOLEAN",
  "DATE",
  "SELECT",
]);

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

const reportDateFieldTypes = new Set(["DATE", "DATETIME"]);

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

function requireActiveStatusOption(
  statusField: {
    id: string;
    options: Array<{ id: string; isActive: boolean }>;
  },
  optionId: string | undefined,
) {
  if (!optionId) {
    throw new AppViewConfigError("Selecciona el estado por defecto de checking.", "defaultCheckInOptionId");
  }

  const option = statusField.options.find((item) => item.id === optionId);

  if (!option || !option.isActive) {
    throw new AppViewConfigError(
      "El estado por defecto de checking debe pertenecer al campo Estado y estar activo.",
      "defaultCheckInOptionId",
    );
  }

  return option;
}

function requireActiveTargetField<
  TField extends { id: string; isActive: boolean; name: string },
>(
  fields: TField[],
  fieldId: string,
  label: string,
) {
  const field = fields.find((item) => item.id === fieldId);

  if (!field || !field.isActive) {
    throw new AppViewConfigError(`Selecciona un campo activo válido para ${label}.`);
  }

  return field;
}

function fieldRelationTargetsEntity(config: Prisma.JsonValue | null, entityTypeId: string) {
  return getRelationConfig(config).targetEntityTypeId === entityTypeId;
}

function logAttendanceValidationIssue(reason: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  console.warn("attendance AppView validation failed", {
    reason,
    ...details,
  });
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toJsonConfig(config: AppViewConfig): Prisma.InputJsonObject {
  const jsonConfig = { ...config } as Record<string, unknown>;
  delete jsonConfig.type;

  return jsonConfig as Prisma.InputJsonObject;
}

function parseFormBoolean(formData: FormData, key: string, defaultValue = false) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return defaultValue;
  }

  return value === "on" || value === "true" || value === "1";
}

class AppViewConfigError extends Error {
  fieldName?: string;

  constructor(message: string, fieldName?: string) {
    super(message);
    this.name = "AppViewConfigError";
    this.fieldName = fieldName;
  }
}

export function suggestedAppViewSlug(name: string) {
  return slugify(name);
}
