import type { PanelConfig } from "./app-views";

export const PANEL_FEATURES = ["capture-time-v1", "counts-v1", "difference-v1", "groups-v1", "today-v1"] as const;
export type PanelFeature = typeof PANEL_FEATURES[number];
export type PanelCompatibility = { version: 1; status: "compatible" | "update-required"; required: PanelFeature[]; accepted: PanelFeature[]; definitionRevision: string };
export const PANEL_UPDATE_MESSAGE = "Esta experiencia requiere actualizar Opco Client. Tus datos guardados y pendientes se conservan. Actualiza la aplicación cuando puedas hacerlo sin cerrar un borrador.";

/** Standard Accept parameter, not a bundle number or an authorization grant. */
export function panelConsumerFeatures(accept: string | null): PanelFeature[] {
  for (const media of (accept ?? "").split(",")) {
    const [type, ...parts] = media.split(";").map(part => part.trim());
    if (type.toLowerCase() !== "application/json") continue;
    const params = new Map<string, string>();
    let valid = true;
    for (const part of parts) {
      const [key, value, extra] = part.split("=");
      if (!key || value === undefined || extra !== undefined || params.has(key.toLowerCase())) { valid = false; break; }
      params.set(key.toLowerCase(), value);
    }
    if (!valid || params.get("opco-panel") !== "1") continue;
    const features = params.get("features") ?? "";
    if (!/^[a-z0-9.-]*$/.test(features)) continue;
    return PANEL_FEATURES.filter(feature => features.split(".").includes(feature));
  }
  return [];
}

export function requiredPanelFeatures(config: Pick<PanelConfig, "filters" | "datasets"> & Partial<Pick<PanelConfig,"modules">>): PanelFeature[] {
  const required = new Set<PanelFeature>();
  if(config.modules?.some(m=>m.visualization.type==="TABLE"&&m.visualization.config.columns.some(c=>c.captureTime)))required.add("capture-time-v1");
  if (config.filters.some(filter => filter.defaultValue?.type === "TODAY")) required.add("today-v1");
  for (const dataset of config.datasets) {
    if (dataset.groupBy) required.add("groups-v1");
    if (dataset.relationCounts?.length) required.add("counts-v1");
    if (dataset.relationCounts?.some(count => count.difference)) required.add("difference-v1");
  }
  return [...required].sort();
}
export function panelCompatibility(config: PanelConfig, definitionRevision: string, consumer: readonly string[]): PanelCompatibility | undefined {
  const required = requiredPanelFeatures(config);
  if (!required.length) return undefined;
  const accepted = required.filter(feature => consumer.includes(feature));
  return { version: 1, status: accepted.length === required.length ? "compatible" : "update-required", required, accepted, definitionRevision };
}

/** Legacy-recognized TABLE shell: no new filters, grouping, computed values or data. */
export function panelUpdatePlaceholder(config: PanelConfig): Omit<PanelConfig, "type"> {
  const source = config.datasets[0];
  const fieldId = source.transformation.fieldIds[0];
  return { schemaVersion: 1, layout: { columns: 12, rowHeight: 8, distribution: "AUTO" }, filters: [],
    datasets: [{ id: source.id, name: "Actualización necesaria", source: source.source, filters: [],
      transformation: { type: "RECORDS", fieldIds: [fieldId], pagination: { pageSize: 1 } } }],
    metrics: [], calculatedFields: [], modules: [{ id: "panel-client-update", title: "Actualización necesaria", datasetId: source.id,
      visualization: { type: "TABLE", config: { columns: [{ fieldId }], searchable: false, paginated: false } },
      layout: { x: 0, y: 0, w: 12, h: 6 } }] };
}

/** Binds the negotiated representation, including safe metadata projections, to read revisions. */
export function panelReadRepresentation(data: Record<string, unknown>): unknown | undefined {
  if (data.panelCompatibility) return data.panelCompatibility;
  if (!Array.isArray(data.views)) return undefined;
  const views = data.views.filter(view => view?.panelCompatibility).map(view => ({ id: view.id, panelCompatibility: view.panelCompatibility }));
  return views.length ? views.sort((a, b) => a.id.localeCompare(b.id)) : undefined;
}
