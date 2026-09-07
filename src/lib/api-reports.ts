import { Prisma } from "@prisma/client";

import { userCanAccessAppView } from "@/lib/app-view-access";
import { parseAppViewConfig, type ReportAppViewConfig } from "@/lib/app-views";
import { serializeApiEntityField, serializeApiEntityRecord } from "@/lib/api-entity-serializer";
import { badRequest, forbidden, notFound } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import {
  getStateUpdateCurrentProjection,
  type StateUpdateCurrentProjectionRow,
} from "@/lib/state-update-projection";

type ReportQuery = {
  from?: string | null;
  to?: string | null;
};

export async function getApiReport({
  contractId,
  appViewId,
  query,
  userId,
}: {
  appViewId: string;
  contractId: string;
  query: ReportQuery;
  userId: string;
}) {
  const canAccess = await userCanAccessAppView({ appViewId, contractId, userId });

  if (!canAccess) {
    return {
      ok: false as const,
      response: forbidden("No tienes acceso a esta experiencia.", "APP_VIEW_FORBIDDEN"),
    };
  }

  const appView = await prisma.appView.findFirst({
    where: {
      active: true,
      contractId,
      id: appViewId,
      type: "REPORT",
    },
  });

  if (!appView) {
    return {
      ok: false as const,
      response: notFound("Reporte no encontrado.", "REPORT_NOT_FOUND"),
    };
  }

  const config = parseAppViewConfig(appView);

  if (config.type !== "REPORT") {
    return {
      ok: false as const,
      response: badRequest("La experiencia no está configurada como reporte.", "INVALID_REPORT"),
    };
  }

  const range = parseReportRange(query);

  if (!range.ok) {
    return range;
  }

  if (config.sourceMode === "STATE_UPDATE") {
    return getApiStateUpdateCurrentReport({
      appView,
      config,
      contractId,
      range,
    });
  }

  const entity = await prisma.entityType.findFirst({
    include: {
      fields: {
        include: {
          options: {
            orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
          },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        where: { isActive: true },
      },
    },
    where: {
      contractId,
      id: config.entityTypeId,
      isActive: true,
    },
  });

  if (!entity) {
    return {
      ok: false as const,
      response: badRequest("La entidad del reporte no está disponible.", "INVALID_REPORT_ENTITY"),
    };
  }

  const fieldsById = new Map(entity.fields.map((field) => [field.id, field]));
  const requiredFieldIds = reportRequiredFieldIds(config);
  const fields = requiredFieldIds
    .map((fieldId) => fieldsById.get(fieldId))
    .filter((field): field is NonNullable<typeof field> => Boolean(field));

  if (fields.length !== requiredFieldIds.length || !fieldsById.has(config.dateFieldId)) {
    return {
      ok: false as const,
      response: badRequest("Este reporte necesita configuración.", "INVALID_REPORT_CONFIG"),
    };
  }

  const records = await prisma.entityRecord.findMany({
    include: {
      outgoingRelations: {
        include: {
          targetRecord: {
            select: {
              displayName: true,
              entityTypeId: true,
              id: true,
            },
          },
        },
        orderBy: { targetRecord: { displayName: "asc" } },
        where: { sourceFieldId: { in: requiredFieldIds } },
      },
      values: {
        select: {
          booleanValue: true,
          dateValue: true,
          decimalValue: true,
          entityFieldId: true,
          integerValue: true,
          jsonValue: true,
          textValue: true,
        },
        where: { entityFieldId: { in: requiredFieldIds } },
      },
    },
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    where: {
      entityTypeId: entity.id,
      values: {
        some: {
          dateValue: {
            gte: range.from,
            lte: range.to,
          },
          entityFieldId: config.dateFieldId,
        },
      },
    },
  });

  const sortedRecords = sortReportRecords({
    config,
    fieldsById,
    records,
  });

  return {
    ok: true as const,
    data: {
      appView: {
        id: appView.id,
        name: appView.name,
        slug: appView.slug,
      },
      config: stripConfigType(config),
      entity: {
        id: entity.id,
        name: entity.name,
        slug: entity.slug,
      },
      fields: fields.map(serializeApiEntityField),
      from: formatDateParam(range.from),
      records: sortedRecords.map((record) => serializeApiEntityRecord({ fields, record })),
      to: formatDateParam(range.to),
    },
  };
}

async function getApiStateUpdateCurrentReport({
  appView,
  config,
  contractId,
  range,
}: {
  appView: { id: string; name: string; slug: string };
  config: Extract<ReportAppViewConfig, { sourceMode: "STATE_UPDATE" }>;
  contractId: string;
  range: Extract<ReturnType<typeof parseReportRange>, { ok: true }>;
}) {
  const projection = await getStateUpdateCurrentProjection({
    contractId,
    stateUpdateAppViewId: config.stateUpdateAppViewId,
  });

  if (!projection.ok) {
    return projection;
  }

  const fieldsById = new Map(projection.data.fields.map((field) => [field.id, field]));
  const requiredFieldIds = reportRequiredFieldIds(config);
  const fields = requiredFieldIds
    .map((fieldId) => fieldsById.get(fieldId))
    .filter((field): field is NonNullable<typeof field> => Boolean(field));

  if (fields.length !== requiredFieldIds.length) {
    return {
      ok: false as const,
      response: badRequest("Este reporte necesita configuración.", "INVALID_REPORT_CONFIG"),
    };
  }

  const records = sortStateUpdateProjectionRows({
    config,
    rows: projection.data.rows,
  }).map((row) => ({
    currentRecordId: row.currentRecordId,
    currentUpdatedAt: row.currentUpdatedAt,
    displayName: row.subject.displayName,
    id: row.subject.id,
    states: row.states,
    subject: row.subject,
    updatedAt: row.currentUpdatedAt,
    values: Object.fromEntries(fields.map((field) => [field.key, row.values[field.id] ?? null])),
  }));

  return {
    ok: true as const,
    data: {
      appView: {
        id: appView.id,
        name: appView.name,
        slug: appView.slug,
      },
      config: stripConfigType(config),
      entity: {
        id: projection.data.subjectEntityType.id,
        name: projection.data.subjectEntityType.name,
        slug: projection.data.subjectEntityType.slug,
      },
      fields,
      from: formatDateParam(range.from),
      projection: {
        sourceAppView: projection.data.appView,
        targetEntityType: projection.data.targetEntityType,
        type: "STATE_UPDATE_CURRENT",
        workflow: projection.data.workflow,
      },
      records,
      to: formatDateParam(range.to),
    },
  };
}

function parseReportRange(query: ReportQuery) {
  const today = new Date();
  const defaultDate = formatDateParam(today);
  const fromParam = query.from || defaultDate;
  const toParam = query.to || fromParam;

  if (!isDateParam(fromParam) || !isDateParam(toParam)) {
    return {
      ok: false as const,
      response: badRequest("El rango de fechas no es válido.", "INVALID_REPORT_DATE_RANGE"),
    };
  }

  const from = new Date(`${fromParam}T00:00:00.000Z`);
  const to = new Date(`${toParam}T23:59:59.999Z`);

  if (from.getTime() > to.getTime()) {
    return {
      ok: false as const,
      response: badRequest("Desde no puede ser posterior a Hasta.", "INVALID_REPORT_DATE_RANGE"),
    };
  }

  return { ok: true as const, from, to };
}

function reportRequiredFieldIds(config: ReportAppViewConfig) {
  if (config.sourceMode === "STATE_UPDATE") {
    return Array.from(new Set([
      ...config.table.visibleFieldIds,
      config.table.defaultSortFieldId,
    ].filter((fieldId): fieldId is string => Boolean(fieldId))));
  }

  const fieldIds = config.presentationMode === "TABLE"
    ? [config.dateFieldId, ...config.table.visibleFieldIds, config.table.defaultSortFieldId]
    : [
        config.dateFieldId,
        config.matrix.rowFieldId,
        config.matrix.columnFieldId,
        config.matrix.valueFieldId,
        config.matrix.summaryFieldId,
      ];

  return Array.from(new Set(fieldIds.filter((fieldId): fieldId is string => Boolean(fieldId))));
}

function sortStateUpdateProjectionRows({
  config,
  rows,
}: {
  config: Extract<ReportAppViewConfig, { sourceMode: "STATE_UPDATE" }>;
  rows: StateUpdateCurrentProjectionRow[];
}) {
  if (!config.table.defaultSortFieldId) {
    return rows;
  }

  const direction = config.table.defaultSortDirection === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const leftValue = comparableProjectionValue(left.values[config.table.defaultSortFieldId as string]);
    const rightValue = comparableProjectionValue(right.values[config.table.defaultSortFieldId as string]);
    const comparison = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });

    return comparison === 0 ? left.subject.displayName.localeCompare(right.subject.displayName) : comparison * direction;
  });
}

function comparableProjectionValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("label" in value && typeof value.label === "string") return value.label;
    if ("optionId" in value && typeof value.optionId === "string") return value.optionId;
    return JSON.stringify(value);
  }

  return String(value);
}

function sortReportRecords({
  config,
  fieldsById,
  records,
}: {
  config: ReportAppViewConfig;
  fieldsById: Map<string, { id: string; key: string }>;
  records: Array<{
    displayName: string;
    id: string;
    updatedAt: Date;
    values: Array<{
      booleanValue?: boolean | null;
      dateValue?: Date | null;
      decimalValue?: Prisma.Decimal | null;
      entityFieldId: string;
      integerValue?: number | null;
      jsonValue?: Prisma.JsonValue | null;
      textValue?: string | null;
    }>;
  }>;
}) {
  if (config.presentationMode !== "TABLE" || !config.table.defaultSortFieldId) {
    return records;
  }

  const sortField = fieldsById.get(config.table.defaultSortFieldId);

  if (!sortField) {
    return records;
  }

  const direction = config.table.defaultSortDirection === "asc" ? 1 : -1;

  return [...records].sort((left, right) => {
    const leftValue = comparableValue(left.values.find((value) => value.entityFieldId === sortField.id));
    const rightValue = comparableValue(right.values.find((value) => value.entityFieldId === sortField.id));
    const comparison = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });

    return comparison === 0 ? left.displayName.localeCompare(right.displayName) : comparison * direction;
  });
}

function comparableValue(value: {
  booleanValue?: boolean | null;
  dateValue?: Date | null;
  decimalValue?: Prisma.Decimal | null;
  integerValue?: number | null;
  jsonValue?: Prisma.JsonValue | null;
  textValue?: string | null;
} | undefined) {
  if (!value) return "";
  if (value.dateValue) return value.dateValue.toISOString();
  if (value.textValue !== null && value.textValue !== undefined) return value.textValue;
  if (value.integerValue !== null && value.integerValue !== undefined) return String(value.integerValue);
  if (value.decimalValue !== null && value.decimalValue !== undefined) return value.decimalValue.toString();
  if (value.booleanValue !== null && value.booleanValue !== undefined) return String(value.booleanValue);
  return JSON.stringify(value.jsonValue ?? "");
}

function stripConfigType(config: ReportAppViewConfig) {
  const normalized = { ...config } as Record<string, unknown>;
  delete normalized.type;
  if (normalized.sourceMode === "ENTITY") {
    delete normalized.sourceMode;
  }
  return normalized;
}

function isDateParam(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatDateParam(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}
