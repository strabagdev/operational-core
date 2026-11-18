import { PANEL_FEATURES } from "./panel-consumer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./prisma";
import { getApiPanel } from "./panels";
import { getAppViewInput, parseAppViewConfig, updateAppView } from "./app-views";
import { panelFixtureConfig, panelFixtureIds as i } from "../test/panel-local-fixture";
import { panelLocalScope as s, seedLocalPanel } from "../test/panel-local-seed";
const enabled = Boolean(process.env.PANEL_DAILY_PG_INTEGRATION_DATABASE_URL);
const run = enabled ? describe : describe.skip;
const read = async (datasetId = "daily", day = "2026-11-17", page = "1", pageSize = "1") => {
  const response = await getApiPanel({ consumerFeatures: PANEL_FEATURES, appViewId: s.view, contractId: s.contract, userId: s.user, query: { datasetId, filters: JSON.stringify({ day }), page, pageSize } });
  if (!response.ok) throw new Error(await response.response.text());
  return response.data;
};
const values = (data: Awaited<ReturnType<typeof read>>) => Object.fromEntries(data.datasets[0].rows.map(row => [row.id, row.values]));
run("PANEL daily groups and historical inverse counts — real isolated PostgreSQL", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.PANEL_DAILY_PG_INTEGRATION_DATABASE_URL;
    const count = await prisma.organization.count();
    if (count) throw new Error("The dedicated test database must be empty");
    await seedLocalPanel(prisma);
  }, 30000);
  afterAll(async () => { await prisma.$disconnect(); });
  it("saves every option through ordinary PANEL FormData without a fixed date", async () => {
    const config = panelFixtureConfig();
    const form = new FormData();
    for (const [key, value] of Object.entries({ name: "Resumen diario y control histórico — ficticio", slug: "local-panel-view", type: "PANEL", active: "on", sortOrder: "0", panelConfig: JSON.stringify(config) })) form.set(key, value);
    const saved = await updateAppView(s.contract, s.view, s.user, getAppViewInput(form));
    expect(saved).not.toBeNull();
    expect(parseAppViewConfig(saved!)).toMatchObject({ filters: [{ defaultValue: { type: "TODAY", timeZone: "America/Santiago" } }], datasets: [{ groupBy: config.datasets[0].groupBy }, { relationCounts: config.datasets[1].relationCounts }] });
  });
  it("counts every delivery over the complete day while paginating whole identity groups", async () => {
    const first = await read(), second = await read("daily", "2026-11-17", "2");
    expect(first.metrics.map(metric => [metric.id, metric.value])).toEqual([["total", 4], ["people", 3], ["a", 3], ["b", 1]]);
    expect(first.datasets[0].grouping?.totalRecords).toBe(4);
    expect(first.datasets[0].pagination).toMatchObject({ total: 3, pageSize: 1, hasMore: true, unit: "GROUP" });
    expect(first.datasets[0].rows).toHaveLength(2);
    expect(first.datasets[0].grouping?.groups[0]).toMatchObject({ relationRecordId: "local_person_1", count: 2 });
    expect(second.datasets[0].grouping?.groups[0].relationRecordId).not.toBe("local_person_1");
    expect(second.metrics.map(metric => metric.value)).toEqual(first.metrics.map(metric => metric.value));
    const all = await read("daily", "2026-11-17", "1", "25");
    expect(all.datasets[0].grouping?.groups.filter(group => group.displayName === "FICTICIO-IGUAL")).toHaveLength(2);
  });
  it("empty days show zero and no groups; both configured options count by option identity", async () => {
    const empty = await read("daily", "2026-11-15");
    expect(empty.metrics.map(metric => metric.value)).toEqual([0, 0, 0, 0]);
    expect(empty.datasets[0].rows).toEqual([]);
    expect(empty.datasets[0].grouping?.groups).toEqual([]);
  });
  it("includes resources without events, unknown quantities and negative balances", async () => {
    const data = await read("resources", "2026-11-17", "1", "25"), rows = values(data);
    expect(data.datasets[0].pagination.total).toBe(5);
    expect(rows.local_resource_A).toMatchObject({ [i.initial]: 2, "count:events": 4, "difference:events": -2 });
    expect(rows.local_resource_B).toMatchObject({ "count:events": 3, "difference:events": 7 });
    expect(rows.local_resource_C).toMatchObject({ "count:events": 0, "difference:events": 7 });
    expect(rows.local_resource_D).toMatchObject({ [i.initial]: null, "count:events": 0, "difference:events": null });
    expect(rows.local_resource_E).toMatchObject({ "count:events": 1, "difference:events": -1 });
    expect(data.datasets[0].schema.fields.find(field => field.id === "difference:events")?.emptyLabel).toBe("Sin cantidad definida");
    expect(data.datasets[0].coverage).toEqual({ source: "SERVER", includesPending: false });
  });
  it("preserves a negative configured initial amount without clamping it", async () => {
    await prisma.entityValue.updateMany({ where: { entityRecordId: "local_resource_C", entityFieldId: i.initial }, data: { integerValue: -3 } });
    try { expect(values(await read("resources", "2026-11-17", "1", "25")).local_resource_C).toMatchObject({ [i.initial]: -3, "count:events": 0, "difference:events": -3 }); }
    finally { await prisma.entityValue.updateMany({ where: { entityRecordId: "local_resource_C", entityFieldId: i.initial }, data: { integerValue: 7 } }); }
  });
  it("day selection and row pagination never restrict historical quantities", async () => {
    const a = await read("resources", "2026-11-15", "1", "25"), b = await read("resources", "2026-11-17", "1", "25");
    expect(a.datasets).toEqual(b.datasets);
    expect(values(await read("resources", "2026-11-17", "2", "1")).local_resource_B).toEqual(values(b).local_resource_B);
  });
  it("correcting one event's resource updates both balances without creating a delivery or changing initial amounts", async () => {
    const before = await prisma.entityRecord.count({ where: { entityTypeId: i.events } });
    await prisma.entityRelation.updateMany({ where: { sourceRecordId: "local_event_1", sourceFieldId: i.resource }, data: { targetRecordId: "local_resource_B" } });
    try {
      const rows = values(await read("resources", "2026-11-17", "1", "25"));
      expect(rows.local_resource_A).toMatchObject({ [i.initial]: 2, "count:events": 3, "difference:events": -1 });
      expect(rows.local_resource_B).toMatchObject({ [i.initial]: 10, "count:events": 4, "difference:events": 6 });
      expect((await read()).metrics[0].value).toBe(4);
      expect(await prisma.entityRecord.count({ where: { entityTypeId: i.events } })).toBe(before);
    } finally { await prisma.entityRelation.updateMany({ where: { sourceRecordId: "local_event_1", sourceFieldId: i.resource }, data: { targetRecordId: "local_resource_A" } }); }
  });
  it("keeps a 33-record group intact despite pageSize=1", async () => {
    for (let n = 0; n < 31; n++) await prisma.entityRecord.create({ data: { id: `local_extra_${n}`, displayName: `Extra ficticio ${n}`, entityTypeId: i.events,
      values: { create: [{ entityFieldId: i.date, dateValue: new Date("2026-11-17T00:00:00Z") }, { entityFieldId: i.status, textValue: "alpha" }] },
      outgoingRelations: { create: [{ sourceFieldId: i.worker, targetRecordId: "local_person_1" }, { sourceFieldId: i.resource, targetRecordId: "local_resource_A" }] } } });
    try {
      const data = await read();
      expect(data.metrics[0].value).toBe(35);
      expect(data.datasets[0].grouping?.groups[0].count).toBe(33);
      expect(data.datasets[0].rows).toHaveLength(33);
    } finally { await prisma.entityRelation.deleteMany({ where: { sourceRecordId: { startsWith: "local_extra_" } } }); await prisma.entityRecord.deleteMany({ where: { id: { startsWith: "local_extra_" } } }); }
  });
  it("rejects text as initial amount and interactive dates in historical counts", async () => {
    const config = panelFixtureConfig();
    const wrong = structuredClone(config);
    wrong.datasets[1].relationCounts![0].difference.fieldId = i.code;
    const form = new FormData();
    for (const [key, value] of Object.entries({ name: "Invalid", slug: "local-panel-view", type: "PANEL", active: "on", panelConfig: JSON.stringify(wrong) })) form.set(key, value);
    await expect(updateAppView(s.contract, s.view, s.user, getAppViewInput(form))).rejects.toThrow("numérico");
    expect(() => parseAppViewConfig({ type: "PANEL", config: { ...config, datasets: config.datasets.map((dataset, n) => n ? { ...dataset, relationCounts: [{ ...dataset.relationCounts![0], filters: [{ type: "PANEL_FILTER", filterId: "day", fieldId: i.date, operator: "EQ" }] }] } : dataset) } })).toThrow();
    const invalidMetric = { ...config, metrics: [...config.metrics, { id: "derived-condition", name: "No soportada", datasetId: "resources", aggregation: "COUNT", filterIds: [], conditions: [{ fieldId: "difference:events", operator: "IS_EMPTY" }] }] };
    form.set("panelConfig", JSON.stringify(invalidMetric));
    await expect(updateAppView(s.contract, s.view, s.user, getAppViewInput(form))).rejects.toThrow("columnas de lectura");
    form.set("panelConfig", JSON.stringify({ ...config, metrics: [...config.metrics, { id: "derived-sum", name: "No soportada", datasetId: "resources", aggregation: "SUM", fieldId: "count:events", filterIds: [] }] }));
    await expect(updateAppView(s.contract, s.view, s.user, getAppViewInput(form))).rejects.toThrow("campos fuente");
    expect((await prisma.appView.findUniqueOrThrow({ where: { id: s.view } })).config).toEqual(config);
  });
  it("rejects cardinality drift instead of splitting groups or counting a row twice", async () => {
    await prisma.entityField.update({ where: { id: i.resource }, data: { config: { targetEntityTypeId: i.resources, relationKind: "MANY" } } });
    try { await expect(read("resources")).rejects.toThrow("INVALID_PANEL_CONFIG"); }
    finally { await prisma.entityField.update({ where: { id: i.resource }, data: { config: { targetEntityTypeId: i.resources, relationKind: "ONE" } } }); }
    await prisma.entityField.update({ where: { id: i.worker }, data: { config: { targetEntityTypeId: i.workers, relationKind: "MANY" } } });
    try { await expect(read()).rejects.toThrow("INVALID_PANEL_CONFIG"); }
    finally { await prisma.entityField.update({ where: { id: i.worker }, data: { config: { targetEntityTypeId: i.workers, relationKind: "ONE" } } }); }
  });
  it("respects permission revocation before reading any dataset", async () => {
    await prisma.userAppViewAccess.deleteMany({ where: { appViewId: s.view, userId: s.user } });
    try { const denied = await getApiPanel({ consumerFeatures: PANEL_FEATURES, appViewId: s.view, contractId: s.contract, userId: s.user, query: {} }); expect(denied.ok).toBe(false); if (!denied.ok) expect(denied.response.status).toBe(403); }
    finally { await prisma.userAppViewAccess.create({ data: { appViewId: s.view, userId: s.user, contractId: s.contract } }); }
  });
});
