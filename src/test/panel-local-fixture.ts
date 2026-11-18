/** Fictitious identifiers and quantities, exclusively for isolated PANEL validation. */
export const panelFixtureIds = { workers: "local_panel_people", resources: "local_panel_resources", events: "local_panel_events",
  identifier: "local_panel_identifier", name: "local_panel_name", code: "local_panel_code", initial: "local_panel_initial",
  worker: "local_panel_person", date: "local_panel_date", status: "local_panel_status", resource: "local_panel_resource",
  optionA: "local_panel_option_a", optionB: "local_panel_option_b" };
const i = panelFixtureIds;
export const panelFixtureConfig = () => ({ schemaVersion: 1, layout: { columns: 12, rowHeight: 8, distribution: "AUTO" },
  filters: [{ id: "day", label: "Fecha", valueType: "DATE", required: true, defaultValue: { type: "TODAY", timeZone: "America/Santiago" } }],
  datasets: [
    { id: "daily", name: "Resumen diario", source: { type: "ENTITY", entityTypeId: i.events },
      relatedFields: [{ relationFieldId: i.worker, fieldId: i.identifier }, { relationFieldId: i.worker, fieldId: i.name }],
      groupBy: { relationFieldId: i.worker, primaryFieldId: `related:${i.worker}:${i.identifier}`, secondaryFieldId: `related:${i.worker}:${i.name}` },
      filters: [{ type: "PANEL_FILTER", filterId: "day", fieldId: i.date, operator: "EQ" }],
      transformation: { type: "RECORDS", fieldIds: [i.worker, i.date, i.status, i.resource], pagination: { pageSize: 1 } } },
    { id: "resources", name: "Control histórico por recurso", source: { type: "ENTITY", entityTypeId: i.resources },
      filters: [], relationCounts: [{ id: "events", label: "Entregas históricas", sourceEntityTypeId: i.events, relationFieldId: i.resource,
        difference: { fieldId: i.initial, label: "Saldo", emptyLabel: "Sin cantidad definida" } }],
      transformation: { type: "RECORDS", fieldIds: [i.code, i.initial], pagination: { pageSize: 25 } } },
  ], metrics: [
    { id: "total", name: "Entregas", datasetId: "daily", aggregation: "COUNT", filterIds: ["day"] },
    { id: "people", name: "Personas distintas", datasetId: "daily", aggregation: "COUNT_DISTINCT", fieldId: i.worker, filterIds: ["day"] },
    ...[i.optionA, i.optionB].map((id, n) => ({ id: n ? "b" : "a", name: n ? "Entregas B" : "Entregas A", datasetId: "daily", aggregation: "COUNT", filterIds: ["day"],
      conditions: [{ fieldId: i.status, operator: "EQUALS", value: { type: "OPTION", optionId: id } }] })),
  ], calculatedFields: [], modules: [
    ...["total", "people", "a", "b"].map((id, n) => ({ id: `kpi-${id}`, title: ["Entregas", "Personas distintas", "Entregas A", "Entregas B"][n], datasetId: "daily",
      visualization: { type: "KPI", config: { metricId: id, label: ["Entregas", "Personas distintas", "Entregas A", "Entregas B"][n], format: "INTEGER" } }, layout: { x: n * 3, y: 0, w: 3, h: 2 } })),
    { id: "daily-detail", title: "Registros por persona", datasetId: "daily", visualization: { type: "TABLE", config: { columns: [i.date, i.status, i.resource].map(fieldId => ({ fieldId })), searchable: false, paginated: true } }, layout: { x: 0, y: 2, w: 12, h: 7 } },
    { id: "resource-table", title: "Control histórico por lote", datasetId: "resources", visualization: { type: "TABLE", config: { columns: [i.code, i.initial, "count:events", "difference:events"].map(fieldId => ({ fieldId })), searchable: false, paginated: true } }, layout: { x: 0, y: 9, w: 12, h: 6 } },
  ],
});
export function panelFixtureDefinitions() {
  const field = (id: string, name: string, type: string, config: unknown = null) => ({ id, name, key: id, type, config, isActive: true, sortOrder: 0, options: [] as object[] });
  return [
    { id: i.workers, name: "Personas ficticias", fields: [field(i.identifier, "Identificador", "TEXT"), field(i.name, "Nombre", "TEXT")] },
    { id: i.resources, name: "Lotes ficticios", fields: [field(i.code, "Lote", "TEXT"), field(i.initial, "Cantidad inicial ficticia", "INTEGER")] },
    { id: i.events, name: "Entregas ficticias", fields: [field(i.worker, "Persona", "RELATION", { targetEntityTypeId: i.workers, relationKind: "ONE" }), field(i.date, "Fecha", "DATE"),
      { ...field(i.status, "Turno configurado", "SELECT"), options: [{ id: i.optionA, label: "A", value: "alpha", isActive: true, sortOrder: 0 }, { id: i.optionB, label: "B", value: "beta", isActive: true, sortOrder: 1 }] },
      field(i.resource, "Lote", "RELATION", { targetEntityTypeId: i.resources, relationKind: "ONE" })] },
  ];
}
