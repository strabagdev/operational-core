import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { userCanAccessAppView } from "@/lib/app-view-access";
import { latestByRelationRecords } from "@/lib/latest-by-relation";
import { prisma } from "@/lib/prisma";

import { getApiPanel, panelConfigRevision } from "./panels";

vi.mock("@/lib/app-view-access", () => ({
  userCanAccessAppView: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appView: {
      findFirst: vi.fn(),
    },
    entityRecord: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    entityType: {
      findFirst: vi.fn(),
    },
  },
}));

const userCanAccessAppViewMock = vi.mocked(userCanAccessAppView);
const appViewFindFirst = vi.mocked(prisma.appView.findFirst);
const entityTypeFindFirst = vi.mocked(prisma.entityType.findFirst);
const entityRecordCount = vi.mocked(prisma.entityRecord.count);
const entityRecordFindMany = vi.mocked(prisma.entityRecord.findMany);

beforeEach(() => {
  vi.clearAllMocks();
  userCanAccessAppViewMock.mockResolvedValue(true);
  appViewFindFirst.mockResolvedValue({
    active: true,
    config: panelConfig(),
    contractId: "contract_1",
    icon: null,
    id: "panel_1",
    name: "Panel Operativo",
    slug: "panel-operativo",
    sortOrder: 1,
    type: "PANEL",
  } as never);
  entityTypeFindFirst.mockResolvedValue(panelEntityType() as never);
  entityRecordCount.mockResolvedValue(1 as never);
  entityRecordFindMany.mockResolvedValue([panelRecord("record_1")] as never);
});

describe("getApiPanel", () => {
  it("authorizes the AppView and returns a RECORDS dataset keyed by stable field ids", async () => {
    const result = await getApiPanel({
      appViewId: "panel_1",
      contractId: "contract_1",
      query: { page: "1", pageSize: "10" },
      userId: "user_1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(userCanAccessAppViewMock).toHaveBeenCalledWith({
      appViewId: "panel_1",
      contractId: "contract_1",
      userId: "user_1",
    });
    expect(appViewFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { active: true, contractId: "contract_1", id: "panel_1", type: "PANEL" },
    }));
    expect(entityTypeFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { contractId: "contract_1", id: "versions", isActive: true },
    }));
    expect(entityRecordFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ entityTypeId: "versions" }),
    }));
    expect(result.data.datasets[0]?.schema.fields.map((field) => field.id)).toEqual([
      "status_field",
      "date_field",
    ]);
    expect(result.data.datasets[0]?.rows[0]?.values).toEqual({
      status_field: "vigente",
      date_field: "2026-09-05",
    });
    expect(result.data.configRevision).toHaveLength(64);
    expect(typeof result.data.calculatedAt).toBe("string");
    expect(result.data.metrics).toEqual([]);
  });

  it("executes legacy PANEL configs with overlapping modules for read compatibility", async () => {
    appViewFindFirst.mockResolvedValueOnce({
      active: true,
      config: panelConfig({
        modules: [
          {
            id: "kpi-1",
            title: "Indicador",
            datasetId: "records",
            visualization: {
              type: "KPI",
              config: { metricId: "total-registros", label: "Total", format: "NUMBER" },
            },
            layout: { x: 0, y: 1, w: 4, h: 2 },
          },
          panelConfig().modules[0],
        ],
        metrics: [
          { id: "total-registros", name: "Total", datasetId: "records", aggregation: "COUNT", fieldId: null, filterIds: [] },
        ],
      }),
      contractId: "contract_1",
      icon: null,
      id: "panel_1",
      name: "Panel Operativo",
      slug: "panel-operativo",
      sortOrder: 1,
      type: "PANEL",
    } as never);

    const result = await getApiPanel({
      appViewId: "panel_1",
      contractId: "contract_1",
      query: { page: "1", pageSize: "10" },
      userId: "user_1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.modules.map((module) => module.layout)).toEqual([
      { x: 0, y: 1, w: 4, h: 2 },
      { x: 0, y: 0, w: 12, h: 6 },
    ]);
  });

  it("calculates COUNT metrics for RECORDS over all filtered rows instead of the visible page", async () => {
    appViewFindFirst.mockResolvedValueOnce({
      active: true,
      config: panelConfig({
        datasets: [
          {
            id: "records",
            source: { type: "ENTITY", entityTypeId: "versions" },
            transformation: {
              type: "RECORDS",
              fieldIds: ["status_field", "date_field"],
              pagination: { pageSize: 1 },
            },
          },
        ],
        metrics: [
          { id: "total-registros", name: "Total", datasetId: "records", aggregation: "COUNT", fieldId: null, filterIds: [] },
        ],
        modules: [
          panelConfig().modules[0],
          {
            id: "total-kpi",
            title: "Total",
            datasetId: "records",
            visualization: {
              type: "KPI",
              config: { metricId: "total-registros", label: "Total", format: "NUMBER" },
            },
            layout: { x: 0, y: 6, w: 4, h: 2 },
          },
          {
            id: "total-kpi-copy",
            title: "Total copia",
            datasetId: "records",
            visualization: {
              type: "KPI",
              config: { metricId: "total-registros", label: "Total", format: "NUMBER" },
            },
            layout: { x: 4, y: 6, w: 4, h: 2 },
          },
        ],
      }),
      contractId: "contract_1",
      icon: null,
      id: "panel_1",
      name: "Panel Operativo",
      slug: "panel-operativo",
      sortOrder: 1,
      type: "PANEL",
    } as never);
    entityRecordFindMany.mockResolvedValueOnce([
      panelRecord("record_1", "2026-09-05"),
      panelRecord("record_2", "2026-09-06"),
    ] as never);

    const result = await getApiPanel({
      appViewId: "panel_1",
      contractId: "contract_1",
      query: { page: "1", pageSize: "1" },
      userId: "user_1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.datasets[0]?.rows).toHaveLength(1);
    expect(result.data.metrics).toEqual([
      expect.objectContaining({
        id: "total-registros",
        datasetId: "records",
        value: 2,
        valueType: "NUMBER",
      }),
    ]);
    expect(entityRecordFindMany).toHaveBeenCalledTimes(1);
  });

  it("returns only metrics for the executed dataset without executing other datasets", async () => {
    appViewFindFirst.mockResolvedValueOnce({
      active: true,
      config: panelConfig({
        datasets: [
          {
            id: "records",
            source: { type: "ENTITY", entityTypeId: "versions" },
            transformation: { type: "RECORDS", fieldIds: ["status_field"], pagination: { pageSize: 1 } },
          },
          {
            id: "latest-procedures",
            source: { type: "ENTITY", entityTypeId: "versions" },
            transformation: {
              type: "LATEST_BY_RELATION",
              relatedEntityTypeId: "procedures",
              relationFieldId: "procedure_field",
              orderFieldId: "date_field",
              fieldIds: ["procedure_field", "status_field", "date_field"],
            },
          },
        ],
        metrics: [
          { id: "records-count", name: "Registros", datasetId: "records", aggregation: "COUNT", fieldId: null, filterIds: [] },
          { id: "latest-count", name: "Últimos", datasetId: "latest-procedures", aggregation: "COUNT", fieldId: null, filterIds: [] },
        ],
      }),
      contractId: "contract_1",
      icon: null,
      id: "panel_1",
      name: "Panel Operativo",
      slug: "panel-operativo",
      sortOrder: 1,
      type: "PANEL",
    } as never);
    entityRecordFindMany.mockResolvedValueOnce([
      panelRecord("record_1"),
      panelRecord("record_2"),
    ] as never);

    const result = await getApiPanel({
      appViewId: "panel_1",
      contractId: "contract_1",
      query: { datasetId: "records", pageSize: "1" },
      userId: "user_1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.datasets.map((dataset) => dataset.id)).toEqual(["records"]);
    expect(result.data.metrics.map((metric) => metric.id)).toEqual(["records-count"]);
    expect(result.data.metrics[0]?.value).toBe(2);
    expect(entityTypeFindFirst).toHaveBeenCalledTimes(1);
    expect(entityRecordFindMany).toHaveBeenCalledTimes(1);
  });

  it("calculates COUNT for LATEST_BY_RELATION after grouping related records", async () => {
    appViewFindFirst.mockResolvedValueOnce({
      active: true,
      config: latestByRelationPanelConfig({
        metrics: [
          { id: "procedures-current", name: "Procedimientos", datasetId: "latest-procedures", aggregation: "COUNT", fieldId: null, filterIds: [] },
        ],
        modules: [
          ...latestByRelationPanelConfig().modules,
          {
            id: "procedures-kpi",
            title: "Procedimientos",
            datasetId: "latest-procedures",
            visualization: {
              type: "KPI",
              config: { metricId: "procedures-current", label: "Procedimientos", format: "INTEGER" },
            },
            layout: { x: 0, y: 6, w: 4, h: 2 },
          },
        ],
      }),
      contractId: "contract_1",
      icon: null,
      id: "panel_1",
      name: "Panel Operativo",
      slug: "panel-operativo",
      sortOrder: 1,
      type: "PANEL",
    } as never);
    entityRecordFindMany.mockResolvedValueOnce([
      latestPanelRecord("version_2", "procedure_1", "2026-09-02"),
      latestPanelRecord("version_1", "procedure_1", "2026-09-01"),
      latestPanelRecord("version_3", "procedure_2", "2026-09-03"),
    ] as never);

    const result = await getApiPanel({
      appViewId: "panel_1",
      contractId: "contract_1",
      query: { datasetId: "latest-procedures" },
      userId: "user_1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.datasets[0]?.pagination.total).toBe(2);
    expect(result.data.metrics[0]).toMatchObject({ id: "procedures-current", value: 2 });
  });

  it("applies metric PANEL filters before LATEST_BY_RELATION grouping and aggregation", async () => {
    appViewFindFirst.mockResolvedValueOnce({
      active: true,
      config: latestByRelationPanelConfig({
        filters: [{ id: "status", valueType: "OPTION" }],
        datasets: [
          {
            id: "latest-procedures",
            source: { type: "ENTITY", entityTypeId: "versions" },
            filters: [
              { type: "PANEL_FILTER", filterId: "status", fieldId: "status_field", operator: "EQ" },
            ],
            transformation: {
              type: "LATEST_BY_RELATION",
              relatedEntityTypeId: "procedures",
              relationFieldId: "procedure_field",
              orderFieldId: "date_field",
              fieldIds: ["procedure_field", "status_field", "revision_field", "date_field"],
              pagination: { pageSize: 1 },
            },
          },
        ],
        metrics: [
          { id: "current-procedures", name: "Vigentes", datasetId: "latest-procedures", aggregation: "COUNT", fieldId: null, filterIds: ["status"] },
        ],
      }),
      contractId: "contract_1",
      icon: null,
      id: "panel_1",
      name: "Panel Operativo",
      slug: "panel-operativo",
      sortOrder: 1,
      type: "PANEL",
    } as never);
    entityRecordFindMany.mockResolvedValueOnce([
      latestPanelRecord("version_newer_but_not_current", "procedure_1", "2026-09-03", undefined, "vencido"),
      latestPanelRecord("version_current", "procedure_1", "2026-09-02", undefined, "vigente"),
      latestPanelRecord("version_other_current", "procedure_2", "2026-09-01", undefined, "vigente"),
    ] as never);

    const result = await getApiPanel({
      appViewId: "panel_1",
      contractId: "contract_1",
      query: { filters: JSON.stringify({ status: "status_current" }), page: "1", pageSize: "1" },
      userId: "user_1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.datasets[0]?.pagination.total).toBe(2);
    expect(result.data.datasets[0]?.rows.map((row) => row.id)).toEqual(["version_current"]);
    expect(result.data.metrics[0]).toMatchObject({ id: "current-procedures", value: 2 });
  });


  it("calculates COUNT_VALUES, COUNT_DISTINCT, SUM, AVG, MIN, and MAX metrics", async () => {
    appViewFindFirst.mockResolvedValueOnce({
      active: true,
      config: panelConfig({
        datasets: [
          {
            id: "records",
            source: { type: "ENTITY", entityTypeId: "versions" },
            transformation: {
              type: "RECORDS",
              fieldIds: ["status_field", "date_field", "revision_field", "decimal_field", "boolean_field"],
              pagination: { pageSize: 2 },
            },
          },
        ],
        metrics: [
          { id: "status-values", name: "Valores", datasetId: "records", aggregation: "COUNT_VALUES", fieldId: "status_field", filterIds: [] },
          { id: "status-distinct", name: "Distintos", datasetId: "records", aggregation: "COUNT_DISTINCT", fieldId: "status_field", filterIds: [] },
          { id: "boolean-values", name: "Booleanos", datasetId: "records", aggregation: "COUNT_VALUES", fieldId: "boolean_field", filterIds: [] },
          { id: "boolean-distinct", name: "Booleanos distintos", datasetId: "records", aggregation: "COUNT_DISTINCT", fieldId: "boolean_field", filterIds: [] },
          { id: "revision-sum", name: "Suma", datasetId: "records", aggregation: "SUM", fieldId: "revision_field", filterIds: [] },
          { id: "revision-avg", name: "Promedio", datasetId: "records", aggregation: "AVG", fieldId: "revision_field", filterIds: [] },
          { id: "revision-min", name: "Revisión mínima", datasetId: "records", aggregation: "MIN", fieldId: "revision_field", filterIds: [] },
          { id: "revision-max", name: "Revisión máxima", datasetId: "records", aggregation: "MAX", fieldId: "revision_field", filterIds: [] },
          { id: "decimal-sum", name: "Suma decimal", datasetId: "records", aggregation: "SUM", fieldId: "decimal_field", filterIds: [] },
          { id: "decimal-avg", name: "Promedio decimal", datasetId: "records", aggregation: "AVG", fieldId: "decimal_field", filterIds: [] },
          { id: "date-min", name: "Mínimo", datasetId: "records", aggregation: "MIN", fieldId: "date_field", filterIds: [] },
          { id: "date-max", name: "Máximo", datasetId: "records", aggregation: "MAX", fieldId: "date_field", filterIds: [] },
        ],
      }),
      contractId: "contract_1",
      icon: null,
      id: "panel_1",
      name: "Panel Operativo",
      slug: "panel-operativo",
      sortOrder: 1,
      type: "PANEL",
    } as never);
    entityRecordFindMany.mockResolvedValueOnce([
      panelRecord("record_1", "2026-09-05", 0, "vigente", new Prisma.Decimal("1.25"), false),
      panelRecord("record_2", "2026-09-06", 3, "vigente", new Prisma.Decimal("2.75"), true),
      panelRecord("record_3", "2026-09-01", 5, "vencido", new Prisma.Decimal("3"), false),
      panelRecord("record_4", "2026-09-10", 10, "", new Prisma.Decimal("4"), true),
      panelRecord("record_5", "2026-09-08", 2, null, new Prisma.Decimal("5"), false),
    ] as never);

    const result = await getApiPanel({
      appViewId: "panel_1",
      contractId: "contract_1",
      query: { page: "1", pageSize: "2" },
      userId: "user_1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.datasets[0]?.rows).toHaveLength(2);
    expect(Object.fromEntries(result.data.metrics.map((metric) => [metric.id, metric.value]))).toEqual({
      "status-values": 3,
      "status-distinct": 2,
      "boolean-values": 5,
      "boolean-distinct": 2,
      "revision-sum": 20,
      "revision-avg": 4,
      "revision-min": 0,
      "revision-max": 10,
      "decimal-sum": 16,
      "decimal-avg": 3.2,
      "date-min": "2026-09-01",
      "date-max": "2026-09-10",
    });
    expect(result.data.metrics.find((metric) => metric.id === "date-min")?.valueType).toBe("DATE");
  });

  it("applies optional PANEL filters only to metrics that include the filter id", async () => {
    appViewFindFirst.mockResolvedValueOnce({
      active: true,
      config: panelConfig({
        filters: [{ id: "status", valueType: "OPTION" }],
        datasets: [
          {
            id: "records",
            source: { type: "ENTITY", entityTypeId: "versions" },
            filters: [
              { type: "PANEL_FILTER", filterId: "status", fieldId: "status_field", operator: "EQ" },
            ],
            transformation: {
              type: "RECORDS",
              fieldIds: ["status_field", "date_field"],
              pagination: { pageSize: 1 },
            },
          },
        ],
        metrics: [
          { id: "all-records", name: "Todos", datasetId: "records", aggregation: "COUNT", fieldId: null, filterIds: [] },
          { id: "filtered-records", name: "Filtrados", datasetId: "records", aggregation: "COUNT", fieldId: null, filterIds: ["status"] },
        ],
      }),
      contractId: "contract_1",
      icon: null,
      id: "panel_1",
      name: "Panel Operativo",
      slug: "panel-operativo",
      sortOrder: 1,
      type: "PANEL",
    } as never);
    entityRecordFindMany.mockResolvedValueOnce([
      panelRecord("record_1", "2026-09-05", 1, "vigente"),
      panelRecord("record_2", "2026-09-06", 2, "vigente"),
      panelRecord("record_3", "2026-09-07", 3, "vencido"),
    ] as never);

    const result = await getApiPanel({
      appViewId: "panel_1",
      contractId: "contract_1",
      query: { filters: JSON.stringify({ status: "status_current" }), pageSize: "1" },
      userId: "user_1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.datasets[0]?.pagination.total).toBe(2);
    expect(Object.fromEntries(result.data.metrics.map((metric) => [metric.id, metric.value]))).toEqual({
      "all-records": 3,
      "filtered-records": 2,
    });
    expect(entityRecordFindMany).toHaveBeenCalledTimes(1);
  });

  it("applies PANEL_FILTER bindings before pagination", async () => {
    appViewFindFirst.mockResolvedValueOnce({
      active: true,
      config: panelConfig({
        filters: [{ id: "status", valueType: "OPTION", required: true }],
        datasets: [
          {
            id: "records",
            source: { type: "ENTITY", entityTypeId: "versions" },
            filters: [
              { type: "PANEL_FILTER", filterId: "status", fieldId: "status_field", operator: "EQ" },
            ],
            transformation: {
              type: "RECORDS",
              fieldIds: ["status_field", "date_field"],
              pagination: { pageSize: 25 },
            },
          },
        ],
      }),
      contractId: "contract_1",
      icon: null,
      id: "panel_1",
      name: "Panel Operativo",
      slug: "panel-operativo",
      sortOrder: 1,
      type: "PANEL",
    } as never);

    await getApiPanel({
      appViewId: "panel_1",
      contractId: "contract_1",
      query: { filters: JSON.stringify({ status: "status_current" }) },
      userId: "user_1",
    });

    expect(entityRecordFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          {
            values: {
              some: {
                entityFieldId: "status_field",
                textValue: "vigente",
              },
            },
          },
        ]),
      }),
    }));
  });

  it("sorts RECORDS datasets by configured field before paginating the response", async () => {
    appViewFindFirst.mockResolvedValueOnce({
      active: true,
      config: panelConfig({
        datasets: [
          {
            id: "records",
            source: { type: "ENTITY", entityTypeId: "versions" },
            sort: [{ fieldId: "date_field", direction: "desc" }],
            transformation: {
              type: "RECORDS",
              fieldIds: ["status_field", "date_field"],
              pagination: { pageSize: 1 },
            },
          },
        ],
      }),
      contractId: "contract_1",
      icon: null,
      id: "panel_1",
      name: "Panel Operativo",
      slug: "panel-operativo",
      sortOrder: 1,
      type: "PANEL",
    } as never);
    entityRecordFindMany.mockResolvedValueOnce([
      panelRecord("record_old", "2026-09-01"),
      panelRecord("record_new", "2026-09-05"),
    ] as never);

    const result = await getApiPanel({
      appViewId: "panel_1",
      contractId: "contract_1",
      query: {},
      userId: "user_1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.datasets[0]?.rows.map((row) => row.id)).toEqual(["record_new"]);
    expect(result.data.datasets[0]?.pagination).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 2,
      hasMore: true,
    });
  });

  it("returns a 400 when required panel filters are missing", async () => {
    appViewFindFirst.mockResolvedValueOnce({
      active: true,
      config: panelConfig({
        filters: [{ id: "status", valueType: "OPTION", required: true }],
        datasets: [
          {
            id: "records",
            source: { type: "ENTITY", entityTypeId: "versions" },
            filters: [
              { type: "PANEL_FILTER", filterId: "status", fieldId: "status_field", operator: "EQ" },
            ],
            transformation: { type: "RECORDS", fieldIds: ["status_field"] },
          },
        ],
      }),
      contractId: "contract_1",
      icon: null,
      id: "panel_1",
      name: "Panel Operativo",
      slug: "panel-operativo",
      sortOrder: 1,
      type: "PANEL",
    } as never);

    const result = await getApiPanel({
      appViewId: "panel_1",
      contractId: "contract_1",
      query: {},
      userId: "user_1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
  });

  it("reduces LATEST_BY_RELATION rows after configured filters and resolves ties by record id", async () => {
    appViewFindFirst.mockResolvedValueOnce({
      active: true,
      config: latestByRelationPanelConfig(),
      contractId: "contract_1",
      icon: null,
      id: "panel_1",
      name: "Dashboard Procedimientos",
      slug: "dashboard-procedimientos",
      sortOrder: 1,
      type: "PANEL",
    } as never);
    entityRecordFindMany.mockResolvedValueOnce([
      latestPanelRecord("version_2", "procedure_1", "2026-09-02"),
      latestPanelRecord("version_1", "procedure_1", "2026-09-01"),
      latestPanelRecord("version_a", "procedure_2", "2026-09-03"),
      latestPanelRecord("version_b", "procedure_2", "2026-09-03"),
    ] as never);

    const result = await getApiPanel({
      appViewId: "panel_1",
      contractId: "contract_1",
      query: {},
      userId: "user_1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(entityRecordFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({
            values: expect.objectContaining({
              some: expect.objectContaining({ entityFieldId: "status_field" }),
            }),
          }),
        ]),
      }),
    }));
    expect(result.data.datasets[0]?.rows.map((row) => row.id)).toEqual(["version_a", "version_2"]);
    expect(result.data.modules[0]?.visualization.type).toBe("TABLE");
    if (result.data.modules[0]?.visualization.type !== "TABLE") return;
    expect(result.data.modules[0].visualization.config.columns.map((column) => column.fieldId)).toEqual([
      "procedure_field",
      "status_field",
      "revision_field",
      "date_field",
    ]);
  });

  it("returns forbidden when the assigned AppView access check fails", async () => {
    userCanAccessAppViewMock.mockResolvedValueOnce(false);

    const result = await getApiPanel({
      appViewId: "panel_1",
      contractId: "contract_1",
      query: {},
      userId: "user_1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    expect(appViewFindFirst).not.toHaveBeenCalled();
  });
});

describe("panelConfigRevision", () => {
  it("is stable for equal configs and changes when configuration changes", () => {
    expect(panelConfigRevision({ type: "PANEL", ...panelConfig() } as never)).toBe(panelConfigRevision({ type: "PANEL", ...panelConfig() } as never));
    expect(panelConfigRevision({ type: "PANEL", ...panelConfig() } as never)).not.toBe(panelConfigRevision({ type: "PANEL", ...panelConfig({
      layout: { columns: 6 },
    }) } as never));
  });
});

describe("latestByRelationRecords", () => {
  it("selects the latest record by configured order field without using timestamps", () => {
    const records = [
      latestPanelRecord("version_old_updated_later", "procedure_1", "2026-09-01", new Date("2026-09-10T00:00:00.000Z")),
      latestPanelRecord("version_new", "procedure_1", "2026-09-03", new Date("2026-09-03T00:00:00.000Z")),
    ];

    expect(latestByRelationRecords({
      orderFieldId: "date_field",
      records,
      relationFieldId: "procedure_field",
    }).map((record) => record.id)).toEqual(["version_new"]);
  });
});

function panelConfig(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    layout: { columns: 12 },
    filters: [],
    datasets: [
      {
        id: "records",
        source: { type: "ENTITY", entityTypeId: "versions" },
        transformation: {
          type: "RECORDS",
          fieldIds: ["status_field", "date_field"],
          pagination: { pageSize: 25 },
        },
      },
    ],
    metrics: [],
    calculatedFields: [],
    modules: [
      {
        id: "table",
        datasetId: "records",
        visualization: {
          type: "TABLE",
          config: {
            columns: [
              { fieldId: "status_field" },
              { fieldId: "date_field", format: "DD-MM-YYYY" },
            ],
          },
        },
        layout: { x: 0, y: 0, w: 12, h: 6 },
      },
    ],
    ...overrides,
  };
}

function latestByRelationPanelConfig(overrides: Record<string, unknown> = {}) {
  return panelConfig({
    datasets: [
      {
        id: "latest-procedures",
        source: { type: "ENTITY", entityTypeId: "versions" },
        transformation: {
          type: "LATEST_BY_RELATION",
          relatedEntityTypeId: "procedures",
          relationFieldId: "procedure_field",
          orderFieldId: "date_field",
          requiredValueFieldId: "status_field",
          fieldIds: ["procedure_field", "status_field", "revision_field", "date_field"],
          pagination: { pageSize: 25 },
        },
      },
    ],
    modules: [
      {
        id: "procedure-table",
        datasetId: "latest-procedures",
        visualization: {
          type: "TABLE",
          config: {
            columns: [
              { fieldId: "procedure_field" },
              { fieldId: "status_field" },
              { fieldId: "revision_field" },
              { fieldId: "date_field", format: "DD-MM-YYYY" },
            ],
          },
        },
        layout: { x: 0, y: 0, w: 12, h: 6 },
      },
    ],
    ...overrides,
  });
}

function panelEntityType() {
  return {
    fields: [
      {
        config: null,
        id: "status_field",
        isActive: true,
        key: "estatus",
        name: "Estatus",
        options: [
          { id: "status_current", isActive: true, label: "Vigente", sortOrder: 1, value: "vigente" },
        ],
        sortOrder: 1,
        type: "SELECT",
      },
      {
        config: null,
        id: "date_field",
        isActive: true,
        key: "fecha",
        name: "Fecha",
        options: [],
        sortOrder: 2,
        type: "DATE",
      },
      {
        config: null,
        id: "revision_field",
        isActive: true,
        key: "revision",
        name: "Revisión",
        options: [],
        sortOrder: 3,
        type: "INTEGER",
      },
      {
        config: null,
        id: "decimal_field",
        isActive: true,
        key: "monto",
        name: "Monto",
        options: [],
        sortOrder: 4,
        type: "DECIMAL",
      },
      {
        config: null,
        id: "boolean_field",
        isActive: true,
        key: "activo",
        name: "Activo",
        options: [],
        sortOrder: 5,
        type: "BOOLEAN",
      },
      {
        config: { targetEntityTypeId: "procedures", relationKind: "ONE" },
        id: "procedure_field",
        isActive: true,
        key: "procedimiento",
        name: "Procedimiento",
        options: [],
        sortOrder: 6,
        type: "RELATION",
      },
    ],
    id: "versions",
    name: "Versionado",
  };
}

function panelRecord(
  id: string,
  date = "2026-09-05",
  revision = 2,
  status: string | null = "vigente",
  decimal = new Prisma.Decimal("1.2"),
  flag = true,
) {
  return {
    displayName: id,
    id,
    outgoingRelations: [],
    updatedAt: new Date("2026-09-05T10:00:00.000Z"),
    values: [
      { entityFieldId: "status_field", textValue: status },
      { entityFieldId: "date_field", dateValue: new Date(`${date}T00:00:00.000Z`) },
      { entityFieldId: "revision_field", integerValue: revision },
      { decimalValue: decimal, entityFieldId: "decimal_field" },
      { booleanValue: flag, entityFieldId: "boolean_field" },
    ],
  };
}

function latestPanelRecord(
  id: string,
  procedureId: string,
  date: string,
  updatedAt = new Date(`${date}T10:00:00.000Z`),
  status = "vigente",
) {
  return {
    displayName: id,
    id,
    outgoingRelations: [
      {
        sourceFieldId: "procedure_field",
        targetRecord: {
          displayName: procedureId,
          entityTypeId: "procedures",
          id: procedureId,
        },
        targetRecordId: procedureId,
      },
    ],
    updatedAt,
    values: [
      { entityFieldId: "date_field", dateValue: new Date(`${date}T00:00:00.000Z`) },
      { entityFieldId: "status_field", textValue: status },
      { entityFieldId: "revision_field", integerValue: 1 },
    ],
  };
}
