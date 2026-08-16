import { Prisma, type AppView, type AppViewType } from "@prisma/client";
import { z } from "zod";

import { getAuthorizedContract } from "./contracts";
import { isEntityIconKey } from "./entity-icons";
import { slugify } from "./format";
import { prisma } from "./prisma";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const appViewTypeValues = ["RECORDS", "WORKFLOW", "BOARD", "DASHBOARD"] as const;
const workflowValues = ["attendance"] as const;
type PrismaClientLike = typeof prisma | Prisma.TransactionClient;

export const appViewTypeOptions = [
  { label: "Registros", value: "RECORDS" },
  { label: "Flujo", value: "WORKFLOW" },
  { label: "Tablero", value: "BOARD" },
  { label: "Dashboard", value: "DASHBOARD" },
] as const satisfies Array<{ label: string; value: AppViewType }>;

export const appViewWorkflowOptions = [
  { label: "Asistencia", value: "attendance" },
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
  | {
      type: "WORKFLOW";
      sourceEntityTypeId: string;
      targetEntityTypeId: string;
      workflow: "attendance";
    }
  | { type: "BOARD"; entityTypeId: string; groupByFieldKey: string }
  | { type: "DASHBOARD"; entityTypeIds: string[] };

export type AppViewInput = z.infer<typeof appViewCommonSchema> & {
  config: AppViewConfig;
};

export function getAppViewTypeLabel(type: AppViewType | string) {
  return appViewTypeOptions.find((option) => option.value === type)?.label ?? String(type);
}

export function getAppViewWorkflowLabel(workflow: string) {
  return appViewWorkflowOptions.find((option) => option.value === workflow)?.label ?? workflow;
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
      sourceEntityTypeId: formData.get("sourceEntityTypeId"),
      targetEntityTypeId: formData.get("targetEntityTypeId"),
      workflow: formData.get("workflow"),
    },
  };
}

export async function getAppViewAdminData(contractId: string, userId: string) {
  const contract = await getAuthorizedContract(contractId, userId);

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
            name: true,
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
  const contract = await getAuthorizedContract(contractId, userId);

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
    return { type: "WORKFLOW", ...workflowConfigInputSchema.parse(raw) };
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
    return `${entityName(config.sourceEntityTypeId)} -> ${entityName(config.targetEntityTypeId)} · ${getAppViewWorkflowLabel(config.workflow)}`;
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
    const config = workflowConfigInputSchema.parse(rawConfig);
    await requireEntityType(client, contractId, config.sourceEntityTypeId);
    await requireEntityType(client, contractId, config.targetEntityTypeId);

    return {
      type,
      sourceEntityTypeId: config.sourceEntityTypeId,
      targetEntityTypeId: config.targetEntityTypeId,
      workflow: config.workflow,
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

const workflowConfigInputSchema = z.object({
  sourceEntityTypeId: z.string().trim().min(1, "Selecciona una entidad fuente."),
  targetEntityTypeId: z.string().trim().min(1, "Selecciona una entidad destino."),
  workflow: z.enum(workflowValues),
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
          isActive: true,
          key: true,
          name: true,
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
  constructor(message: string) {
    super(message);
    this.name = "AppViewConfigError";
  }
}

export function suggestedAppViewSlug(name: string) {
  return slugify(name);
}
