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
const appViewTypeValues = ["RECORDS", "WORKFLOW", "REPORT", "BOARD", "DASHBOARD"] as const;
type PrismaClientLike = typeof prisma | Prisma.TransactionClient;

export const appViewTypeOptions = [
  { label: "Registros", value: "RECORDS" },
  { label: "Flujo", value: "WORKFLOW" },
  { label: "Reporte", value: "REPORT" },
  { label: "Tablero", value: "BOARD" },
  { label: "Dashboard", value: "DASHBOARD" },
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
  | { type: "RECORDS"; entityTypeId: string }
  | AttendanceWorkflowConfig
  | StateUpdateWorkflowConfig
  | ReportAppViewConfig
  | { type: "BOARD"; entityTypeId: string; groupByFieldKey: string }
  | { type: "DASHBOARD"; entityTypeIds: string[] };

export type ReportAppViewConfig = {
  type: "REPORT";
  entityTypeId: string;
  dateFieldId: string;
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
);

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
      requiredStateFieldIds: formData.getAll("requiredStateFieldIds"),
      reportColumnFieldId: formData.get("reportColumnFieldId"),
      reportRowFieldId: formData.get("reportRowFieldId"),
      reportSummaryFieldId: formData.get("reportSummaryFieldId"),
      reportValueFieldId: formData.get("reportValueFieldId"),
      sourceEntityTypeId: formData.get("sourceEntityTypeId"),
      stateFieldIds: formData.getAll("stateFieldIds"),
      stateFieldDefaultOptions: Object.fromEntries(
        Array.from(formData.entries())
          .filter(([key]) => key.startsWith("stateFieldDefaultOptionId:"))
          .map(([key, value]) => [key.slice("stateFieldDefaultOptionId:".length), value]),
      ),
      statusFieldId: formData.get("statusFieldId"),
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
    return { type: "RECORDS", ...recordsConfigInputSchema.parse(raw) };
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

  return { type: "DASHBOARD", ...dashboardConfigInputSchema.parse(raw) };
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
    return `${entityName(config.entityTypeId)} · ${config.presentationMode === "TABLE" ? "Tabla" : "Matriz"}`;
  }

  if (config.type === "BOARD") {
    const entityType = entityTypes.find((item) => item.id === config.entityTypeId);
    const field = entityType?.fields.find((item) => item.key === config.groupByFieldKey);

    return `${entityName(config.entityTypeId)} · ${field?.name ?? config.groupByFieldKey}`;
  }

  return config.entityTypeIds.map(entityName).join(", ");
}

export function friendlyAppViewError(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Revisa los datos de la vista.";
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
    return Object.fromEntries(
      error.issues.map((issue) => [
        issue.path.join(".") || "form",
        [issue.message],
      ]),
    );
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
    const config = recordsConfigInputSchema.parse(rawConfig);
    await requireEntityType(client, contractId, config.entityTypeId);

    return { type, entityTypeId: config.entityTypeId };
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
        presentationMode: "TABLE",
        table: {
          visibleFieldIds: config.table.visibleFieldIds,
          ...(config.table.defaultSortFieldId ? { defaultSortFieldId: config.table.defaultSortFieldId } : {}),
          defaultSortDirection: config.table.defaultSortDirection,
        },
      };
    }

    return {
      type,
      entityTypeId: config.entityTypeId,
      dateFieldId: config.dateFieldId,
      presentationMode: "MATRIX",
      matrix: {
        rowFieldId: config.matrix.rowFieldId,
        columnFieldId: config.matrix.columnFieldId,
        valueFieldId: config.matrix.valueFieldId,
        ...(config.matrix.summaryFieldId ? { summaryFieldId: config.matrix.summaryFieldId } : {}),
      },
    };
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

  const config = dashboardConfigInputSchema.parse(rawConfig);
  const uniqueEntityTypeIds = Array.from(new Set(config.entityTypeIds));

  for (const entityTypeId of uniqueEntityTypeIds) {
    await requireEntityType(client, contractId, entityTypeId);
  }

  return { type, entityTypeIds: uniqueEntityTypeIds };
}

const recordsConfigInputSchema = z.object({
  entityTypeId: z.string().trim().min(1, "Selecciona una entidad."),
});

const reportBaseConfigInputSchema = z.object({
  entityTypeId: z.string().trim().min(1, "Selecciona una entidad."),
  dateFieldId: z.string().trim().min(1, "Selecciona el campo de fecha."),
});

const reportConfigInputSchema = z.discriminatedUnion("presentationMode", [
  reportBaseConfigInputSchema.extend({
    presentationMode: z.literal("TABLE"),
    table: z.object({
      visibleFieldIds: z.array(z.string().trim().min(1)).default([]),
      defaultSortFieldId: z.string().trim().optional().transform((value) => value || undefined),
      defaultSortDirection: z.enum(["asc", "desc"]).default("desc"),
    }),
  }),
  reportBaseConfigInputSchema.extend({
    presentationMode: z.literal("MATRIX"),
    matrix: z.object({
      rowFieldId: z.string().trim().min(1, "Selecciona el campo de filas."),
      columnFieldId: z.string().trim().min(1, "Selecciona el campo de columnas."),
      valueFieldId: z.string().trim().min(1, "Selecciona el campo de valor."),
      summaryFieldId: z.string().trim().optional().transform((value) => value || undefined),
    }),
  }),
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
  const presentationMode = raw.presentationMode === "MATRIX" ? "MATRIX" : "TABLE";

  if (presentationMode === "MATRIX") {
    const matrix = isRecord(raw.matrix) ? raw.matrix : {};

    return reportConfigInputSchema.parse({
      entityTypeId: raw.entityTypeId,
      dateFieldId: raw.dateFieldId,
      presentationMode,
      matrix: {
        rowFieldId: raw.reportRowFieldId ?? matrix.rowFieldId,
        columnFieldId: raw.reportColumnFieldId ?? matrix.columnFieldId,
        valueFieldId: raw.reportValueFieldId ?? matrix.valueFieldId,
        summaryFieldId: raw.reportSummaryFieldId ?? matrix.summaryFieldId,
      },
    });
  }

  const table = isRecord(raw.table) ? raw.table : {};

  return reportConfigInputSchema.parse({
    entityTypeId: raw.entityTypeId,
    dateFieldId: raw.dateFieldId,
    presentationMode,
    table: {
      visibleFieldIds: uniqueStrings(stringArray(raw.visibleFieldIds ?? table.visibleFieldIds)),
      defaultSortFieldId: raw.defaultSortFieldId ?? table.defaultSortFieldId,
      defaultSortDirection: raw.defaultSortDirection ?? table.defaultSortDirection ?? "desc",
    },
  });
}

function validateReportAppViewFields({
  config,
  fields,
}: {
  config: z.infer<typeof reportConfigInputSchema>;
  fields: Array<{
    id: string;
    isActive: boolean;
    name: string;
    type: string;
  }>;
}) {
  const dateField = requireActiveTargetField(fields, config.dateFieldId, "Fecha");

  if (!reportDateFieldTypes.has(dateField.type)) {
    throw new AppViewConfigError("El campo de fecha debe ser de tipo fecha.", "dateFieldId");
  }

  if (config.presentationMode === "TABLE") {
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

    return;
  }

  requireActiveTargetField(fields, config.matrix.rowFieldId, "Filas");
  requireActiveTargetField(fields, config.matrix.columnFieldId, "Columnas");
  requireActiveTargetField(fields, config.matrix.valueFieldId, "Valor");

  if (config.matrix.summaryFieldId) {
    requireActiveTargetField(fields, config.matrix.summaryFieldId, "Resumen lateral");
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

    if (field.type !== "SELECT" || field.multiple) {
      throw new AppViewConfigError("Los campos de estado deben ser selección simple.", "stateFieldIds");
    }

    if (stateField.defaultOptionId) {
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
  for (const extraFieldId of config.extraFieldIds) {
    if (configuredFieldIds.has(extraFieldId)) {
      throw new AppViewConfigError("Los campos extra no deben repetir sujeto, fecha ni estados.", "extraFieldIds");
    }
    const field = requireActiveTargetField(targetFields, extraFieldId, "Campo extra");
    if (!stateUpdateExtraFieldTypes.has(field.type)) {
      throw new AppViewConfigError("Ese tipo de campo extra no está soportado.", "extraFieldIds");
    }
  }
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
