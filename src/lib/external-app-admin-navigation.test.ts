import { describe, expect, it } from "vitest";

import {
  buildExternalAppsHref,
  getActiveExternalAppAdminModal,
} from "./external-app-admin-navigation";

describe("external app admin navigation", () => {
  it("builds settings app links while dropping empty params", () => {
    expect(buildExternalAppsHref(
      "/app/settings/apps",
      { createApp: "1", error: "Error anterior" },
      { createApp: undefined, error: undefined, notice: "Aplicación creada." },
    )).toBe("/app/settings/apps?notice=Aplicaci%C3%B3n+creada.");
  });

  it("resolves the active modal from search params", () => {
    expect(getActiveExternalAppAdminModal({ createApp: "1" })).toEqual({
      type: "create",
    });
    expect(getActiveExternalAppAdminModal({ editApp: "app_1" })).toEqual({
      appId: "app_1",
      type: "edit",
    });
    expect(getActiveExternalAppAdminModal({})).toEqual({
      type: "none",
    });
  });
});
