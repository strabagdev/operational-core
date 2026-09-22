import { describe, expect, it } from "vitest";

import { serializeApiAppView } from "./api-app-views";
import { panelConfigRevision } from "./panels";

describe("PANEL AppView serialization", () => {
  it("exposes a config revision before Client loads a composed snapshot", () => {
    const view = {
      id: "panel_1", icon: null, name: "Panel", slug: "panel", sortOrder: 0, type: "PANEL",
      config: {
        schemaVersion: 1, layout: { columns: 12 }, filters: [], calculatedFields: [],
        datasets: [{ id: "records", source: { type: "ENTITY", entityTypeId: "entity_1" },
          transformation: { type: "RECORDS", fieldIds: ["field_1"] } }],
        metrics: [
          { id: "a", name: "A", datasetId: "records", aggregation: "COUNT", filterIds: [] },
          { id: "b", name: "B", datasetId: "records", aggregation: "COUNT", filterIds: [] },
        ],
        modules: [{ id: "combined", datasetId: "records", visualization: { type: "KPI", config: {
          composition: { metricAId: "a", metricBId: "b", operation: "DIVIDE" }, label: "Razón", format: "PERCENT", percentScale: "RATIO",
        } }, layout: { x: 0, y: 0, w: 2, h: 2 } }],
      },
    } as never;
    const serialized = serializeApiAppView(view);
    expect(serialized?.configRevision).toHaveLength(64);
    expect(serialized?.configRevision).toBe(panelConfigRevision({ type: "PANEL", ...serialized?.config } as never));
    expect(serialized?.config).toMatchObject({ modules: [{ visualization: { config: {
      composition: { metricAId: "a", metricBId: "b", operation: "DIVIDE" },
    } } }] });
  });
});
