import { createHash } from "node:crypto";
import { Prisma, type EntityFieldType } from "@prisma/client";

import { userCanAccessAppView } from "@/lib/app-view-access";
import {
  type DatasetDefinition,
  type FilterExpr,
  type PanelConfig,
  type PanelMetric,
  type PanelMetricAggregation,
  parseAppViewConfig,
} from "@/lib/app-views";
import { badRequest, forbidden, notFound } from "@/lib/api-response";
import { dateOnlyToUtcDate } from "@/lib/date-only";
import { getRelationConfig } from "@/lib/field-validation";
import { latestByRelationRecords } from "@/lib/latest-by-relation";
import { prisma } from "@/lib/prisma";

export type PanelQuery = {
  datasetId?: string | null;
  filters?: string | null;
  page?: string | null;
  pageSize?: string | null;
  search?: string | null;
};

type PanelField = {
  config: Prisma.JsonValue | null;
  id: string;
  isActive: boolean;
  key: string;
  name: string;
  options: Array<{
    id: string;
    isActive: boolean;
    label: string;
    sortOrder: number;
    value: string;
  }>;
  sortOrder: number;
  type: EntityFieldType;
};

type PanelRecord = {
  displayName: string;
  id: string;
  outgoingRelations: Array<{
    sourceFieldId: string;
    targetRecord: {
      displayName: string;
      entityTypeId: string;
      id: string;
    };
    targetRecordId: string;
  }>;
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
};

type PanelMetricResult = {
  calculatedAt: string;
  datasetId: string;
  id: string;
  value: number | string | null;
  valueType: "NUMBER" | "DATE" | "DATETIME";
};

export async function getApiPanel({
  appViewId,
  contractId,
  query,
  userId,
}: {
  appViewId: string;
  contractId: string;
  query: PanelQuery;
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
      type: "PANEL",
    },
  });

  if (!appView) {
    return {
      ok: false as const,
      response: notFound("Panel no encontrado.", "PANEL_NOT_FOUND"),
    };
  }

  const config = parseAppViewConfig(appView);

  if (config.type !== "PANEL") {
    return {
      ok: false as const,
      response: badRequest("La experiencia no está configurada como panel.", "INVALID_PANEL"),
    };
  }

  const dataset = resolveRequestedDataset(config, query.datasetId);

  if (!dataset) {
    return {
      ok: false as const,
      response: badRequest("Dataset no configurado en el panel.", "PANEL_DATASET_NOT_FOUND"),
    };
  }

  const panelFilterValues = parsePanelFilterValues(query.filters);

  if (!panelFilterValues.ok) {
    return panelFilterValues;
  }

  const executedDataset = await executePanelDataset({
    config,
    contractId,
    dataset,
    panelFilterValues: panelFilterValues.values,
    query,
  });

  if (!executedDataset.ok) {
    return executedDataset;
  }

  const calculatedAt = new Date().toISOString();

  return {
    ok: true as const,
    data: {
      appView: {
        id: appView.id,
        name: appView.name,
        slug: appView.slug,
      },
      schemaVersion: config.schemaVersion,
      configRevision: panelConfigRevision(config),
      calculatedAt,
      filters: config.filters,
      datasets: [executedDataset.data],
      metrics: calculatePanelMetrics({
        calculatedAt,
        config,
        executionsByDatasetId: new Map([[dataset.id, executedDataset.execution]]),
        panelFilterValues: panelFilterValues.values,
      }),
      modules: config.modules,
    },
  };
}

export function panelConfigRevision(config: PanelConfig) {
  return createHash("sha256").update(stableStringify(config)).digest("hex");
}

function resolveRequestedDataset(config: PanelConfig, datasetId: string | null | undefined) {
  if (datasetId?.trim()) {
    return config.datasets.find((dataset) => dataset.id === datasetId.trim()) ?? null;
  }

  return config.datasets[0] ?? null;
}

function parsePanelFilterValues(raw: string | null | undefined) {
  if (!raw?.trim()) {
    return { ok: true as const, values: {} as Record<string, unknown> };
  }

  try {
    const value = JSON.parse(raw);

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("invalid filters");
    }

    return { ok: true as const, values: value as Record<string, unknown> };
  } catch {
    return {
      ok: false as const,
      response: badRequest("Los filtros del panel no son válidos.", "INVALID_PANEL_FILTERS"),
    };
  }
}

async function executePanelDataset({
  config,
  contractId,
  dataset,
  panelFilterValues,
  query,
}: {
  config: PanelConfig;
  contractId: string;
  dataset: DatasetDefinition;
  panelFilterValues: Record<string, unknown>;
  query: PanelQuery;
}) {
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
      id: dataset.source.entityTypeId,
      isActive: true,
    },
  });

  if (!entity) {
    return {
      ok: false as const,
      response: badRequest("La entidad del dataset no está disponible.", "INVALID_PANEL_ENTITY"),
    };
  }

  const fieldsById = new Map(entity.fields.map((field) => [field.id, field as PanelField]));
  const fieldIds = panelDatasetFieldIds(dataset);
  const fields = fieldIds
    .map((fieldId) => fieldsById.get(fieldId))
    .filter((field): field is PanelField => Boolean(field));

  if (fields.length !== fieldIds.length) {
    return {
      ok: false as const,
      response: badRequest("El panel necesita configuración.", "INVALID_PANEL_CONFIG"),
    };
  }

  const requiredFilterIds = config.filters
    .filter((filter) => filter.required && dataset.filters?.some((item) => item.type === "PANEL_FILTER" && item.filterId === filter.id))
    .map((filter) => filter.id);
  const requiredPanelFilterIds = new Set(requiredFilterIds);
  const filterWhere = panelFiltersWhere({
    filters: dataset.filters ?? [],
    fieldsById,
    includedPanelFilterIds: requiredPanelFilterIds,
    panelFilterValues,
    requiredFilterIds,
  });

  if (!filterWhere.ok) {
    return filterWhere;
  }

  const page = parsePositiveInt(query.page, 1);
  const defaultPageSize = dataset.transformation.pagination?.pageSize ?? 25;
  const pageSize = Math.min(parsePositiveInt(query.pageSize, defaultPageSize), 100);
  const baseWhere: Prisma.EntityRecordWhereInput = {
    entityTypeId: entity.id,
    AND: [
      ...filterWhere.conditions,
      ...(query.search?.trim() ? [panelSearchWhere(query.search.trim(), fields)] : []),
      ...(dataset.transformation.type === "LATEST_BY_RELATION" && dataset.transformation.requiredValueFieldId
        ? [panelFieldHasValueWhere(dataset.transformation.requiredValueFieldId)]
        : []),
    ],
  };

  const records = await prisma.entityRecord.findMany({
    include: panelRecordInclude(fieldIds),
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    where: baseWhere,
  });
  const displayRecords = transformPanelDatasetRecords({
    dataset,
    fieldsById,
    records: applyPanelFiltersToRecords({
      fieldsById,
      filterIds: panelProvidedDatasetFilterIds(dataset, panelFilterValues, requiredPanelFilterIds),
      filters: dataset.filters ?? [],
      panelFilterValues,
      records: records as PanelRecord[],
    }),
  });

  const total = displayRecords.length;
  const pagedRecords = displayRecords.slice((page - 1) * pageSize, page * pageSize);

  return {
    ok: true as const,
    data: panelDatasetResponse({
      dataset,
      fields,
      page,
      pageSize,
      records: pagedRecords,
      total,
    }),
    execution: {
      dataset,
      fieldsById,
      records: records as PanelRecord[],
    },
  };
}

function panelDatasetFieldIds(dataset: DatasetDefinition) {
  const filterFieldIds = (dataset.filters ?? []).map((filter) => filter.fieldId);

  if (dataset.transformation.type === "RECORDS") {
    return Array.from(new Set([
      ...dataset.transformation.fieldIds,
      ...filterFieldIds,
    ]));
  }

  return Array.from(new Set([
    ...dataset.transformation.fieldIds,
    ...filterFieldIds,
    dataset.transformation.relationFieldId,
    dataset.transformation.orderFieldId,
    dataset.transformation.requiredValueFieldId,
  ].filter((fieldId): fieldId is string => Boolean(fieldId))));
}

function transformPanelDatasetRecords({
  dataset,
  fieldsById,
  records,
}: {
  dataset: DatasetDefinition;
  fieldsById: Map<string, PanelField>;
  records: PanelRecord[];
}) {
  if (dataset.transformation.type === "LATEST_BY_RELATION") {
    return latestByRelationRecords({
      orderFieldId: dataset.transformation.orderFieldId,
      records,
      relationFieldId: dataset.transformation.relationFieldId,
    });
  }

  const sort = dataset.sort?.[0];

  return sort
    ? sortPanelRecords({
        direction: sort.direction,
        field: fieldsById.get(sort.fieldId),
        records,
      })
    : records;
}

function panelRecordInclude(fieldIds: string[]) {
  return {
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
      where: { sourceFieldId: { in: fieldIds } },
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
      where: { entityFieldId: { in: fieldIds } },
    },
  } satisfies Prisma.EntityRecordInclude;
}

function panelDatasetResponse({
  dataset,
  fields,
  page,
  pageSize,
  records,
  total,
}: {
  dataset: DatasetDefinition;
  fields: PanelField[];
  page: number;
  pageSize: number;
  records: PanelRecord[];
  total: number;
}) {
  const responseFields = dataset.transformation.fieldIds
    .map((fieldId) => fields.find((field) => field.id === fieldId))
    .filter((field): field is PanelField => Boolean(field));

  return {
    id: dataset.id,
    schema: {
      fields: responseFields.map((field) => ({
        id: field.id,
        name: field.name,
        options: field.options
          .filter((option) => option.isActive)
          .map((option) => ({
            id: option.id,
            label: option.label,
            value: option.value,
          })),
        type: field.type,
      })),
    },
    rows: records.map((record) => ({
      id: record.id,
      values: Object.fromEntries(responseFields.map((field) => [
        field.id,
        serializePanelFieldValue({
          field,
          record,
        }),
      ])),
    })),
    pagination: {
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    },
  };
}

function panelFiltersWhere({
  filters,
  fieldsById,
  includedPanelFilterIds,
  panelFilterValues,
  requiredFilterIds,
}: {
  filters: FilterExpr[];
  fieldsById: Map<string, PanelField>;
  includedPanelFilterIds?: Set<string>;
  panelFilterValues: Record<string, unknown>;
  requiredFilterIds: string[];
}) {
  const conditions: Prisma.EntityRecordWhereInput[] = [];

  for (const filterId of requiredFilterIds) {
    if (panelFilterValues[filterId] === undefined || panelFilterValues[filterId] === null || panelFilterValues[filterId] === "") {
      return {
        ok: false as const,
        response: badRequest("Falta un filtro requerido del panel.", "PANEL_FILTER_REQUIRED"),
      };
    }
  }

  for (const filter of filters) {
    const field = fieldsById.get(filter.fieldId);

    if (!field) {
      return {
        ok: false as const,
        response: badRequest("El filtro del dataset referencia un campo inválido.", "INVALID_PANEL_CONFIG"),
      };
    }

    if (filter.type === "PANEL_FILTER") {
      if (includedPanelFilterIds && !includedPanelFilterIds.has(filter.filterId)) {
        continue;
      }

      const value = panelFilterValues[filter.filterId];
      if (value === undefined || value === null || value === "") {
        continue;
      }
      conditions.push(panelFieldValueWhere({ field, operator: filter.operator, value }));
      continue;
    }

    if (filter.operator === "HAS_VALUE") {
      conditions.push(panelFieldHasValueWhere(filter.fieldId));
      continue;
    }

    conditions.push(panelFieldValueWhere({
      field,
      operator: filter.operator,
      value: filter.operator === "IN" ? filter.values ?? [] : filter.value,
    }));
  }

  return { ok: true as const, conditions };
}

function panelProvidedDatasetFilterIds(
  dataset: DatasetDefinition,
  panelFilterValues: Record<string, unknown>,
  excludedFilterIds = new Set<string>(),
) {
  return new Set((dataset.filters ?? [])
    .filter((filter) => filter.type === "PANEL_FILTER")
    .map((filter) => filter.filterId)
    .filter((filterId) => !excludedFilterIds.has(filterId))
    .filter((filterId) => panelFilterHasValue(panelFilterValues[filterId])));
}

function applyPanelFiltersToRecords({
  fieldsById,
  filterIds,
  filters,
  panelFilterValues,
  records,
}: {
  fieldsById: Map<string, PanelField>;
  filterIds: Set<string>;
  filters: FilterExpr[];
  panelFilterValues: Record<string, unknown>;
  records: PanelRecord[];
}) {
  if (filterIds.size === 0) {
    return records;
  }

  const selectedFilters = filters.filter((filter) => filter.type === "PANEL_FILTER" && filterIds.has(filter.filterId));

  return records.filter((record) => selectedFilters.every((filter) => {
    if (filter.type !== "PANEL_FILTER") return true;
    const field = fieldsById.get(filter.fieldId);
    const value = panelFilterValues[filter.filterId];

    return field ? panelRecordMatchesFilterValue({ field, filter, record, value }) : false;
  }));
}

function panelFilterHasValue(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}

function panelRecordMatchesFilterValue({
  field,
  filter,
  record,
  value,
}: {
  field: PanelField;
  filter: Extract<FilterExpr, { type: "PANEL_FILTER" }>;
  record: PanelRecord;
  value: unknown;
}) {
  if (!panelFilterHasValue(value)) {
    return true;
  }

  const rawValues = filter.operator === "IN" && Array.isArray(value) ? value : [value];
  const storedValues = rawValues
    .map((item) => panelStoredFilterValue(field, item))
    .filter((item) => item !== undefined)
    .map((item) => panelComparableFilterValue(field, item));

  if (storedValues.length === 0) {
    return false;
  }

  const recordValues = panelRecordComparableValues(record, field);

  return recordValues.some((recordValue) => storedValues.includes(recordValue));
}

function panelRecordComparableValues(record: PanelRecord, field: PanelField) {
  if (field.type === "RELATION") {
    return record.outgoingRelations
      .filter((relation) => relation.sourceFieldId === field.id)
      .map((relation) => relation.targetRecordId);
  }

  const value = record.values.find((item) => item.entityFieldId === field.id);

  if (!value) return [];
  if (value.integerValue !== null && value.integerValue !== undefined) return [String(value.integerValue)];
  if (value.decimalValue !== null && value.decimalValue !== undefined) return [value.decimalValue.toString()];
  if (value.booleanValue !== null && value.booleanValue !== undefined) return [String(value.booleanValue)];
  if (value.dateValue !== null && value.dateValue !== undefined) {
    return [field.type === "DATETIME" ? value.dateValue.toISOString() : formatDateOnly(value.dateValue)];
  }
  if (value.textValue !== null && value.textValue !== undefined) return [value.textValue];
  if (value.jsonValue !== null && value.jsonValue !== undefined) return [JSON.stringify(value.jsonValue)];

  return [];
}

function panelComparableFilterValue(field: PanelField, value: unknown) {
  if (value instanceof Date) {
    return field.type === "DATETIME" ? value.toISOString() : formatDateOnly(value);
  }

  return String(value);
}

function panelFieldValueWhere({
  field,
  operator,
  value,
}: {
  field: PanelField;
  operator: "EQ" | "IN";
  value: unknown;
}): Prisma.EntityRecordWhereInput {
  const values = operator === "IN" && Array.isArray(value) ? value : [value];

  if (field.type === "RELATION") {
    const targetRecordIds = values.filter((item): item is string => typeof item === "string");

    if (targetRecordIds.length === 0) {
      return { id: "__panel_filter_no_match__" };
    }

    return {
      outgoingRelations: {
        some: {
          sourceFieldId: field.id,
          targetRecordId: operator === "IN" ? { in: targetRecordIds } : targetRecordIds[0],
        },
      },
    };
  }

  const storedValues = values.map((item) => panelStoredFilterValue(field, item)).filter((item) => item !== undefined);

  if (storedValues.length === 0) {
    return { id: "__panel_filter_no_match__" };
  }

  if (operator === "IN") {
    return {
      OR: storedValues.map((storedValue) => ({
        values: {
          some: {
            entityFieldId: field.id,
            ...panelStoredValueWhere(field, storedValue),
          },
        },
      })),
    };
  }

  return {
    values: {
      some: {
        entityFieldId: field.id,
        ...panelStoredValueWhere(field, storedValues[0]),
      },
    },
  };
}

function panelStoredFilterValue(field: PanelField, value: unknown) {
  if ((field.type === "SELECT" || field.type === "MULTISELECT") && typeof value === "string") {
    return field.options.find((option) => option.id === value)?.value ?? value;
  }
  if (field.type === "INTEGER" && typeof value === "number") return value;
  if ((field.type === "DECIMAL" || field.type === "MONEY") && typeof value === "number") return value;
  if (field.type === "BOOLEAN" && typeof value === "boolean") return value;
  if ((field.type === "DATE" || field.type === "DATETIME") && typeof value === "string") return dateOnlyToUtcDate(value);
  if (typeof value === "string") return value;

  return undefined;
}

function panelStoredValueWhere(field: PanelField, value: unknown) {
  if (field.type === "INTEGER") {
    return { integerValue: value as number };
  }
  if (field.type === "DECIMAL" || field.type === "MONEY") {
    return { decimalValue: value as number };
  }
  if (field.type === "BOOLEAN") {
    return { booleanValue: value as boolean };
  }
  if (field.type === "DATE" || field.type === "DATETIME") {
    return { dateValue: value as Date };
  }

  return { textValue: value as string };
}

function sortPanelRecords({
  direction,
  field,
  records,
}: {
  direction: "asc" | "desc";
  field: PanelField | undefined;
  records: PanelRecord[];
}) {
  if (!field) return records;
  const multiplier = direction === "asc" ? 1 : -1;

  return [...records].sort((left, right) => {
    const comparison = panelSortableRecordValue(left, field).localeCompare(panelSortableRecordValue(right, field));

    return comparison === 0 ? left.id.localeCompare(right.id) : comparison * multiplier;
  });
}

function panelSortableRecordValue(record: PanelRecord, field: PanelField) {
  if (field.type === "RELATION") {
    return record.outgoingRelations
      .filter((relation) => relation.sourceFieldId === field.id)
      .map((relation) => relation.targetRecord.displayName)
      .join(" ");
  }

  const value = record.values.find((item) => item.entityFieldId === field.id);

  if (!value) return "";
  if (value.dateValue) return value.dateValue.toISOString();
  if (value.integerValue !== null && value.integerValue !== undefined) return String(value.integerValue).padStart(20, "0");
  if (value.decimalValue !== null && value.decimalValue !== undefined) return value.decimalValue.toString().padStart(20, "0");
  if (value.booleanValue !== null && value.booleanValue !== undefined) return value.booleanValue ? "1" : "0";
  if (value.textValue) return value.textValue;

  return "";
}

function panelFieldHasValueWhere(fieldId: string): Prisma.EntityRecordWhereInput {
  return {
    values: {
      some: {
        entityFieldId: fieldId,
        OR: [
          { textValue: { not: null } },
          { integerValue: { not: null } },
          { decimalValue: { not: null } },
          { booleanValue: { not: null } },
          { dateValue: { not: null } },
          { jsonValue: { not: Prisma.JsonNull } },
        ],
      },
    },
  };
}

function panelSearchWhere(search: string, fields: PanelField[]): Prisma.EntityRecordWhereInput {
  return {
    OR: [
      { displayName: { contains: search, mode: "insensitive" } },
      {
        outgoingRelations: {
          some: {
            sourceFieldId: { in: fields.filter((field) => field.type === "RELATION").map((field) => field.id) },
            targetRecord: {
              displayName: { contains: search, mode: "insensitive" },
            },
          },
        },
      },
    ],
  };
}

function serializePanelFieldValue({
  field,
  record,
}: {
  field: PanelField;
  record: PanelRecord;
}) {
  if (field.type === "RELATION") {
    const relations = record.outgoingRelations
      .filter((relation) => relation.sourceFieldId === field.id)
      .map((relation) => ({
        displayName: relation.targetRecord.displayName,
        entityTypeId: relation.targetRecord.entityTypeId,
        id: relation.targetRecordId,
      }));
    const relationKind = getRelationConfig(field.config).relationKind ?? "ONE";

    return relationKind === "MANY" ? relations : relations[0] ?? null;
  }

  const value = record.values.find((item) => item.entityFieldId === field.id);

  if (!value) return null;
  if (value.textValue !== null && value.textValue !== undefined) return value.textValue;
  if (value.integerValue !== null && value.integerValue !== undefined) return value.integerValue;
  if (value.decimalValue !== null && value.decimalValue !== undefined) return value.decimalValue.toString();
  if (value.booleanValue !== null && value.booleanValue !== undefined) return value.booleanValue ? "true" : "false";
  if (value.dateValue !== null && value.dateValue !== undefined) return formatDateOnly(value.dateValue);
  if (value.jsonValue !== null && value.jsonValue !== undefined) return value.jsonValue;

  return null;
}

function calculatePanelMetrics({
  calculatedAt,
  config,
  executionsByDatasetId,
  panelFilterValues,
}: {
  calculatedAt: string;
  config: PanelConfig;
  executionsByDatasetId: Map<string, {
    dataset: DatasetDefinition;
    fieldsById: Map<string, PanelField>;
    records: PanelRecord[];
  }>;
  panelFilterValues: Record<string, unknown>;
}): PanelMetricResult[] {
  const requiredPanelFilterIds = new Set(config.filters
    .filter((filter) => filter.required)
    .map((filter) => filter.id));

  return config.metrics
    .filter((metric) => executionsByDatasetId.has(metric.datasetId))
    .map((metric) => {
      const execution = executionsByDatasetId.get(metric.datasetId);
      const field = metric.fieldId ? execution?.fieldsById.get(metric.fieldId) : undefined;
      const filteredRecords = execution
        ? transformPanelDatasetRecords({
            dataset: execution.dataset,
            fieldsById: execution.fieldsById,
            records: applyPanelFiltersToRecords({
              fieldsById: execution.fieldsById,
              filterIds: new Set(metric.filterIds.filter((filterId) => !requiredPanelFilterIds.has(filterId))),
              filters: execution.dataset.filters ?? [],
              panelFilterValues,
              records: execution.records,
            }),
          })
        : [];

      return {
        id: metric.id,
        datasetId: metric.datasetId,
        value: execution ? aggregatePanelMetric(metric, filteredRecords, field) : null,
        valueType: panelMetricValueType(metric.aggregation, field),
        calculatedAt,
      };
    });
}

function aggregatePanelMetric(
  metric: PanelMetric,
  records: PanelRecord[],
  field: PanelField | undefined,
): PanelMetricResult["value"] {
  if (metric.aggregation === "COUNT") {
    return records.length;
  }

  if (!field) {
    return null;
  }

  const values = records
    .map((record) => panelMetricValue(record, field))
    .filter((value): value is number | string | boolean => value !== null && value !== "");

  if (metric.aggregation === "COUNT_VALUES") {
    return values.length;
  }

  if (metric.aggregation === "COUNT_DISTINCT") {
    return new Set(values.map(panelMetricDistinctKey)).size;
  }

  if (metric.aggregation === "SUM") {
    return numericPanelMetricValues(values).reduce((total, value) => total + value, 0);
  }

  if (metric.aggregation === "AVG") {
    const numericValues = numericPanelMetricValues(values);

    return numericValues.length
      ? numericValues.reduce((total, value) => total + value, 0) / numericValues.length
      : null;
  }

  if (metric.aggregation === "MIN" || metric.aggregation === "MAX") {
    const comparableValues = values.filter((value): value is number | string =>
      typeof value === "number" || typeof value === "string");

    if (comparableValues.length === 0) {
      return null;
    }

    const sortedValues = [...comparableValues].sort((left, right) => {
      if (typeof left === "number" && typeof right === "number") {
        return left - right;
      }

      return String(left).localeCompare(String(right));
    });

    return metric.aggregation === "MIN" ? sortedValues[0] : sortedValues[sortedValues.length - 1];
  }

  return null;
}

function panelMetricValue(record: PanelRecord, field: PanelField) {
  if (field.type === "RELATION") {
    const values = record.outgoingRelations
      .filter((relation) => relation.sourceFieldId === field.id)
      .map((relation) => relation.targetRecordId);

    return values.length > 0 ? values.join(",") : null;
  }

  const value = record.values.find((item) => item.entityFieldId === field.id);

  if (!value) return null;
  if (value.integerValue !== null && value.integerValue !== undefined) return value.integerValue;
  if (value.decimalValue !== null && value.decimalValue !== undefined) return value.decimalValue.toNumber();
  if (value.booleanValue !== null && value.booleanValue !== undefined) return value.booleanValue;
  if (value.dateValue !== null && value.dateValue !== undefined) {
    return field.type === "DATETIME" ? value.dateValue.toISOString() : formatDateOnly(value.dateValue);
  }
  if (value.textValue !== null && value.textValue !== undefined) return value.textValue;
  if (value.jsonValue !== null && value.jsonValue !== undefined) return JSON.stringify(value.jsonValue);

  return null;
}

function numericPanelMetricValues(values: Array<number | string | boolean>) {
  return values
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function panelMetricDistinctKey(value: number | string | boolean) {
  return `${typeof value}:${String(value)}`;
}

function panelMetricValueType(aggregation: PanelMetricAggregation, field: PanelField | undefined): PanelMetricResult["valueType"] {
  if ((aggregation === "MIN" || aggregation === "MAX") && field?.type === "DATE") {
    return "DATE";
  }
  if ((aggregation === "MIN" || aggregation === "MAX") && field?.type === "DATETIME") {
    return "DATETIME";
  }

  return "NUMBER";
}

function parsePositiveInt(value: string | null | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
