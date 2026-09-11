import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseAppViewConfig } from "@/lib/app-views";
import { getApiPanel } from "@/lib/panels";
import { prisma } from "@/lib/prisma";

const runPostgresIntegration = Boolean(process.env.PANEL_PG_INTEGRATION_DATABASE_URL);
const describePostgres = runPostgresIntegration ? describe : describe.skip;

const ids = {
  contract: "panel_pg_contract",
  dateField: "panel_pg_date",
  foreignContract: "panel_pg_foreign_contract",
  foreignOrganization: "panel_pg_foreign_org",
  organization: "panel_pg_org",
  panelView: "panel_pg_view",
  procedure1: "panel_pg_procedure_1",
  procedure2: "panel_pg_procedure_2",
  procedure3: "panel_pg_procedure_3",
  procedureField: "panel_pg_procedure",
  procedures: "panel_pg_procedures",
  reportView: "panel_pg_report",
  revisionField: "panel_pg_revision",
  statusCurrentOption: "panel_pg_status_current",
  statusField: "panel_pg_status",
  statusPreviousOption: "panel_pg_status_previous",
  user: "panel_pg_user",
  version1: "panel_pg_version_1",
  version2: "panel_pg_version_2",
  version3MissingStatus: "panel_pg_version_3_missing_status",
  version4Previous: "panel_pg_version_4_previous",
  version5Current: "panel_pg_version_5_current",
  versionTieA: "panel_pg_version_tie_a",
  versionTieB: "panel_pg_version_tie_b",
  versions: "panel_pg_versions",
};

describePostgres("PANEL PostgreSQL integration", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.PANEL_PG_INTEGRATION_DATABASE_URL;
    await cleanup();
    await seedPanelData();
  }, 30000);

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  }, 30000);

  it("persists and reads a legacy REPORT AppView after migrations", async () => {
    const report = await prisma.appView.findUniqueOrThrow({
      where: { id: ids.reportView },
    });

    expect(report.type).toBe("REPORT");
    expect(parseAppViewConfig(report)).toMatchObject({
      entityTypeId: ids.versions,
      presentationMode: "LATEST_BY_RELATION",
      type: "REPORT",
    });
  });

  it("persists and executes a PANEL AppView with latest-by-relation semantics", async () => {
    const result = await getApiPanel({
      appViewId: ids.panelView,
      contractId: ids.contract,
      query: { page: "1", pageSize: "1" },
      userId: ids.user,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const dataset = result.data.datasets[0];

    expect(result.data.datasets).toHaveLength(1);
    expect(dataset?.pagination).toEqual({
      page: 1,
      pageSize: 1,
      total: 3,
      hasMore: true,
    });
    expect(dataset?.rows.map((row) => row.id)).toEqual([ids.version5Current]);
    expect(result.data.modules[0]?.visualization.type).toBe("TABLE");
    if (result.data.modules[0]?.visualization.type !== "TABLE") return;
    expect(result.data.modules[0].visualization.config.columns.map((column) => column.fieldId)).toEqual([
      ids.procedureField,
      ids.statusField,
      ids.revisionField,
      ids.dateField,
    ]);
    expect(dataset?.schema.fields.map((field) => field.id)).toEqual([
      ids.procedureField,
      ids.statusField,
      ids.revisionField,
      ids.dateField,
    ]);
    expect(dataset?.schema.fields.find((field) => field.id === ids.statusField)?.options).toEqual([
      { id: ids.statusPreviousOption, label: "Histórico", value: "historico" },
      { id: ids.statusCurrentOption, label: "Vigente", value: "vigente" },
    ]);
    expect(dataset?.schema.fields.find((field) => field.id === ids.dateField)?.type).toBe("DATE");
  });

  it("paginates after reducing one latest row per relation", async () => {
    const first = await getApiPanel({
      appViewId: ids.panelView,
      contractId: ids.contract,
      query: { page: "1", pageSize: "1" },
      userId: ids.user,
    });
    const second = await getApiPanel({
      appViewId: ids.panelView,
      contractId: ids.contract,
      query: { page: "2", pageSize: "1" },
      userId: ids.user,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.data.datasets[0]?.rows.map((row) => row.id)).toEqual([ids.version5Current]);
    expect(second.data.datasets[0]?.rows.map((row) => row.id)).toEqual([ids.versionTieA]);
    expect(first.data.datasets[0]?.pagination.total).toBe(3);
    expect(second.data.datasets[0]?.pagination.total).toBe(3);
  });

  it("applies search before grouping and does not let an ineligible newest row displace the latest eligible row", async () => {
    const result = await getApiPanel({
      appViewId: ids.panelView,
      contractId: ids.contract,
      query: { search: "Procedimiento Uno" },
      userId: ids.user,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.datasets[0]?.pagination.total).toBe(1);
    expect(result.data.datasets[0]?.rows.map((row) => row.id)).toEqual([ids.version2]);
    expect(result.data.datasets[0]?.rows[0]?.values[ids.dateField]).toBe("2026-09-02");
  });

  it("executes only the requested dataset and returns controlled errors for invalid dataset ids", async () => {
    const requested = await getApiPanel({
      appViewId: ids.panelView,
      contractId: ids.contract,
      query: { datasetId: "raw-records", pageSize: "1" },
      userId: ids.user,
    });
    const missing = await getApiPanel({
      appViewId: ids.panelView,
      contractId: ids.contract,
      query: { datasetId: "missing" },
      userId: ids.user,
    });

    expect(requested.ok).toBe(true);
    if (requested.ok) {
      expect(requested.data.datasets.map((dataset) => dataset.id)).toEqual(["raw-records"]);
      expect(requested.data.datasets[0]?.pagination.pageSize).toBe(1);
    }
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.response.status).toBe(400);
    }
  });

  it("calculates metrics from the full filtered dataset before paginating rows", async () => {
    const result = await getApiPanel({
      appViewId: ids.panelView,
      contractId: ids.contract,
      query: {
        datasetId: "raw-records",
        filters: JSON.stringify({ status: ids.statusCurrentOption }),
        page: "1",
        pageSize: "1",
      },
      userId: ids.user,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.datasets.map((dataset) => dataset.id)).toEqual(["raw-records"]);
    expect(result.data.datasets[0]?.rows).toHaveLength(1);
    expect(result.data.datasets[0]?.pagination).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 5,
      hasMore: true,
    });
    expect(Object.fromEntries(result.data.metrics.map((metric) => [metric.id, metric.value]))).toEqual({
      "raw-all": 7,
      "raw-current": 5,
      "raw-revision-sum": 18,
      "raw-revision-avg": 18 / 7,
      "raw-date-min": "2026-09-01",
      "raw-date-max": "2026-09-04",
    });
  });

  it("applies metric conditions after latest-by-relation and before aggregation", async () => {
    const result = await getApiPanel({
      appViewId: ids.panelView,
      contractId: ids.contract,
      query: { datasetId: "latest-procedures", page: "1", pageSize: "1" },
      userId: ids.user,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.datasets[0]?.rows).toHaveLength(1);
    expect(result.data.datasets[0]?.pagination).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 3,
      hasMore: true,
    });
    expect(Object.fromEntries(result.data.metrics.map((metric) => [metric.id, metric.value]))).toMatchObject({
      "latest-previous": 0,
      "latest-current-condition": 3,
    });
  });

  it("isolates AppView and entity lookup by contract", async () => {
    const result = await getApiPanel({
      appViewId: ids.panelView,
      contractId: ids.foreignContract,
      query: {},
      userId: ids.user,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });
});

async function seedPanelData() {
  await prisma.organization.createMany({
    data: [
      { id: ids.organization, name: "Panel PG Org", slug: "panel-pg-org" },
      { id: ids.foreignOrganization, name: "Panel PG Foreign Org", slug: "panel-pg-foreign-org" },
    ],
  });
  await prisma.user.create({
    data: {
      email: "panel-pg@example.com",
      id: ids.user,
      name: "Panel PG User",
    },
  });
  await prisma.contract.createMany({
    data: [
      {
        code: "PANEL-PG",
        id: ids.contract,
        name: "Panel PG Contract",
        organizationId: ids.organization,
        slug: "panel-pg",
      },
      {
        code: "PANEL-PG-FOREIGN",
        id: ids.foreignContract,
        name: "Panel PG Foreign Contract",
        organizationId: ids.foreignOrganization,
        slug: "panel-pg-foreign",
      },
    ],
  });
  await prisma.membership.create({
    data: {
      organizationId: ids.organization,
      role: "MEMBER",
      userId: ids.user,
    },
  });
  await prisma.entityType.createMany({
    data: [
      {
        contractId: ids.contract,
        id: ids.procedures,
        name: "Procedimientos",
        nature: "MASTER",
        slug: "procedimientos",
      },
      {
        contractId: ids.contract,
        id: ids.versions,
        name: "Versionado",
        nature: "TRANSACTION",
        slug: "versionado",
      },
    ],
  });
  await prisma.entityField.createMany({
    data: [
      {
        config: { targetEntityTypeId: ids.procedures, relationKind: "ONE" },
        entityTypeId: ids.versions,
        id: ids.procedureField,
        key: "procedimiento",
        name: "Procedimiento",
        sortOrder: 1,
        type: "RELATION",
      },
      {
        entityTypeId: ids.versions,
        id: ids.statusField,
        key: "estatus",
        name: "Estatus",
        sortOrder: 2,
        type: "SELECT",
      },
      {
        entityTypeId: ids.versions,
        id: ids.revisionField,
        key: "revision",
        name: "Revisión",
        sortOrder: 3,
        type: "INTEGER",
      },
      {
        entityTypeId: ids.versions,
        id: ids.dateField,
        key: "fecha",
        name: "Fecha",
        sortOrder: 4,
        type: "DATE",
      },
    ],
  });
  await prisma.fieldOption.createMany({
    data: [
      {
        entityFieldId: ids.statusField,
        id: ids.statusCurrentOption,
        label: "Vigente",
        value: "vigente",
      },
      {
        entityFieldId: ids.statusField,
        id: ids.statusPreviousOption,
        label: "Histórico",
        value: "historico",
      },
    ],
  });
  await prisma.entityRecord.createMany({
    data: [
      { displayName: "Procedimiento Uno", entityTypeId: ids.procedures, id: ids.procedure1 },
      { displayName: "Procedimiento Dos", entityTypeId: ids.procedures, id: ids.procedure2 },
      { displayName: "Procedimiento Tres", entityTypeId: ids.procedures, id: ids.procedure3 },
      { displayName: "Version Uno antigua", entityTypeId: ids.versions, id: ids.version1 },
      { displayName: "Version Uno elegible", entityTypeId: ids.versions, id: ids.version2 },
      { displayName: "Version Uno mas reciente sin estatus", entityTypeId: ids.versions, id: ids.version3MissingStatus },
      { displayName: "Z Version Tres historica", entityTypeId: ids.versions, id: ids.version4Previous },
      { displayName: "Z Version Tres vigente", entityTypeId: ids.versions, id: ids.version5Current },
      { displayName: "Version Dos empate A", entityTypeId: ids.versions, id: ids.versionTieA },
      { displayName: "Version Dos empate B", entityTypeId: ids.versions, id: ids.versionTieB },
    ],
  });
  await prisma.entityRelation.createMany({
    data: [
      { sourceFieldId: ids.procedureField, sourceRecordId: ids.version1, targetRecordId: ids.procedure1 },
      { sourceFieldId: ids.procedureField, sourceRecordId: ids.version2, targetRecordId: ids.procedure1 },
      { sourceFieldId: ids.procedureField, sourceRecordId: ids.version3MissingStatus, targetRecordId: ids.procedure1 },
      { sourceFieldId: ids.procedureField, sourceRecordId: ids.version4Previous, targetRecordId: ids.procedure3 },
      { sourceFieldId: ids.procedureField, sourceRecordId: ids.version5Current, targetRecordId: ids.procedure3 },
      { sourceFieldId: ids.procedureField, sourceRecordId: ids.versionTieA, targetRecordId: ids.procedure2 },
      { sourceFieldId: ids.procedureField, sourceRecordId: ids.versionTieB, targetRecordId: ids.procedure2 },
    ],
  });
  await prisma.entityValue.createMany({
    data: [
      ...versionValues(ids.version1, "vigente", 1, "2026-09-01"),
      ...versionValues(ids.version2, "vigente", 2, "2026-09-02"),
      ...versionValues(ids.version3MissingStatus, null, 3, "2026-09-03"),
      ...versionValues(ids.version4Previous, "historico", 4, "2026-09-01"),
      ...versionValues(ids.version5Current, "vigente", 5, "2026-09-04"),
      ...versionValues(ids.versionTieA, "vigente", 1, "2026-09-04"),
      ...versionValues(ids.versionTieB, "vigente", 2, "2026-09-04"),
    ],
  });
  await prisma.appView.createMany({
    data: [
      {
        active: true,
        config: {
          entityTypeId: ids.versions,
          presentationMode: "LATEST_BY_RELATION",
          latestByRelation: {
            relatedEntityTypeId: ids.procedures,
            relationFieldId: ids.procedureField,
            orderFieldId: ids.dateField,
            requiredValueFieldId: ids.statusField,
            displayFieldIds: [ids.procedureField, ids.statusField, ids.revisionField, ids.dateField],
          },
        },
        contractId: ids.contract,
        id: ids.reportView,
        name: "Reporte Legacy",
        slug: "reporte-legacy",
        type: "REPORT",
      },
      {
        active: true,
        config: panelConfig(),
        contractId: ids.contract,
        id: ids.panelView,
        name: "Dashboard Procedimientos",
        slug: "dashboard-procedimientos",
        type: "PANEL",
      },
    ],
  });
  await prisma.userAppViewAccess.create({
    data: {
      appViewId: ids.panelView,
      contractId: ids.contract,
      userId: ids.user,
    },
  });
}

function versionValues(recordId: string, status: string | null, revision: number, date: string) {
  return [
    ...(status === null
      ? []
      : [{ entityFieldId: ids.statusField, entityRecordId: recordId, textValue: status }]),
    { entityFieldId: ids.revisionField, entityRecordId: recordId, integerValue: revision },
    { dateValue: new Date(`${date}T00:00:00.000Z`), entityFieldId: ids.dateField, entityRecordId: recordId },
  ];
}

function panelConfig() {
  return {
    schemaVersion: 1,
    layout: { columns: 12 },
    filters: [{ id: "status", label: "Estatus", valueType: "OPTION" }],
    datasets: [
      {
        id: "latest-procedures",
        source: { type: "ENTITY", entityTypeId: ids.versions },
        filters: [
          { type: "PANEL_FILTER", filterId: "status", fieldId: ids.statusField, operator: "EQ" },
        ],
        transformation: {
          type: "LATEST_BY_RELATION",
          relatedEntityTypeId: ids.procedures,
          relationFieldId: ids.procedureField,
          orderFieldId: ids.dateField,
          requiredValueFieldId: ids.statusField,
          fieldIds: [ids.procedureField, ids.statusField, ids.revisionField, ids.dateField],
          pagination: { pageSize: 25 },
        },
      },
      {
        id: "raw-records",
        source: { type: "ENTITY", entityTypeId: ids.versions },
        filters: [
          { type: "PANEL_FILTER", filterId: "status", fieldId: ids.statusField, operator: "EQ" },
        ],
        sort: [{ fieldId: ids.dateField, direction: "desc" }],
        transformation: {
          type: "RECORDS",
          fieldIds: [ids.statusField, ids.revisionField, ids.dateField],
          pagination: { pageSize: 25 },
        },
      },
    ],
    metrics: [
      { id: "latest-current", name: "Últimos vigentes", datasetId: "latest-procedures", aggregation: "COUNT", fieldId: null, filterIds: ["status"] },
      { id: "latest-previous", name: "Últimos históricos", datasetId: "latest-procedures", aggregation: "COUNT", fieldId: null, filterIds: [], conditions: [{ fieldId: ids.statusField, operator: "EQUALS", value: { type: "OPTION", optionId: ids.statusPreviousOption } }] },
      { id: "latest-current-condition", name: "Últimos vigentes por condición", datasetId: "latest-procedures", aggregation: "COUNT", fieldId: null, filterIds: [], conditions: [{ fieldId: ids.statusField, operator: "EQUALS", value: { type: "OPTION", optionId: ids.statusCurrentOption } }] },
      { id: "raw-all", name: "Registros", datasetId: "raw-records", aggregation: "COUNT", fieldId: null, filterIds: [] },
      { id: "raw-current", name: "Registros vigentes", datasetId: "raw-records", aggregation: "COUNT", fieldId: null, filterIds: ["status"] },
      { id: "raw-revision-sum", name: "Suma revisión", datasetId: "raw-records", aggregation: "SUM", fieldId: ids.revisionField, filterIds: [] },
      { id: "raw-revision-avg", name: "Promedio revisión", datasetId: "raw-records", aggregation: "AVG", fieldId: ids.revisionField, filterIds: [] },
      { id: "raw-date-min", name: "Fecha mínima", datasetId: "raw-records", aggregation: "MIN", fieldId: ids.dateField, filterIds: [] },
      { id: "raw-date-max", name: "Fecha máxima", datasetId: "raw-records", aggregation: "MAX", fieldId: ids.dateField, filterIds: [] },
    ],
    calculatedFields: [],
    modules: [
      {
        id: "procedure-table",
        datasetId: "latest-procedures",
        visualization: {
          type: "TABLE",
          config: {
            columns: [
              { fieldId: ids.procedureField },
              { fieldId: ids.statusField, valueDisplay: "LABEL" },
              { fieldId: ids.revisionField },
              { fieldId: ids.dateField, format: "DD-MM-YYYY" },
            ],
            paginated: true,
            searchable: true,
          },
        },
        layout: { x: 0, y: 0, w: 12, h: 6 },
      },
    ],
  };
}

async function cleanup() {
  await prisma.userAppViewAccess.deleteMany({
    where: {
      OR: [
        { appViewId: { in: [ids.panelView, ids.reportView] } },
        { contractId: { in: [ids.contract, ids.foreignContract] } },
        { userId: ids.user },
      ],
    },
  });
  await prisma.appView.deleteMany({
    where: { id: { in: [ids.panelView, ids.reportView] } },
  });
  await prisma.entityRelation.deleteMany({
    where: {
      OR: [
        { sourceFieldId: ids.procedureField },
        { sourceRecordId: { in: panelRecordIds() } },
        { targetRecordId: { in: panelRecordIds() } },
      ],
    },
  });
  await prisma.entityValue.deleteMany({
    where: {
      OR: [
        { entityFieldId: { in: [ids.statusField, ids.revisionField, ids.dateField] } },
        { entityRecordId: { in: panelRecordIds() } },
      ],
    },
  });
  await prisma.entityRecord.deleteMany({
    where: { id: { in: panelRecordIds() } },
  });
  await prisma.fieldOption.deleteMany({
    where: { id: { in: [ids.statusCurrentOption, ids.statusPreviousOption] } },
  });
  await prisma.entityField.deleteMany({
    where: { id: { in: [ids.procedureField, ids.statusField, ids.revisionField, ids.dateField] } },
  });
  await prisma.entityType.deleteMany({
    where: { id: { in: [ids.procedures, ids.versions] } },
  });
  await prisma.membership.deleteMany({
    where: {
      OR: [
        { organizationId: { in: [ids.organization, ids.foreignOrganization] } },
        { userId: ids.user },
      ],
    },
  });
  await prisma.contract.deleteMany({
    where: { id: { in: [ids.contract, ids.foreignContract] } },
  });
  await prisma.organization.deleteMany({
    where: {
      id: { in: [ids.organization, ids.foreignOrganization] },
    },
  });
  await prisma.user.deleteMany({
    where: { id: ids.user },
  });
}

function panelRecordIds() {
  return [
    ids.procedure1,
    ids.procedure2,
    ids.procedure3,
    ids.version1,
    ids.version2,
    ids.version3MissingStatus,
    ids.version4Previous,
    ids.version5Current,
    ids.versionTieA,
    ids.versionTieB,
  ];
}
