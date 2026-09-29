import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/auth";
import {
  appViewConfigDiagnostic,
  type AppViewConfig,
  getAuthorizedAppView,
  isExpectedAppViewConfigParseError,
  logAppViewConfigDiagnostic,
  parseAppViewConfig,
  parseAppViewConfigForEditor,
} from "@/lib/app-views";

import AppViewDetailPage from "./page";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/app-views", () => ({
  appViewConfigDiagnostic: vi.fn(() => ({
    code: "invalid_type",
    explanation: "La configuración guardada no coincide con el contrato actual de esta experiencia.",
    path: "datasets",
    reference: "appView=view_invalid;type=PANEL;code=invalid_type;path=datasets",
  })),
  getAppViewTypeLabel: vi.fn((type: string) => ({
    PANEL: "Panel",
    RECORDS: "Registros",
    REPORT: "Reporte",
    WORKFLOW: "Flujo",
  }[type] ?? type)),
  getAuthorizedAppView: vi.fn(),
  isExpectedAppViewConfigParseError: vi.fn((error) => error instanceof Error && error.message === "Invalid config"),
  logAppViewConfigDiagnostic: vi.fn(),
  parseAppViewConfig: vi.fn((view) => (view.config ?? { type: view.type }) as AppViewConfig),
  parseAppViewConfigForEditor: vi.fn((view) => ({
    config: (view.config ?? { type: view.type }) as AppViewConfig,
    repairablePanelTables: [],
  })),
}));

vi.mock("../actions", () => ({
  updateAppViewAction: vi.fn(),
}));

vi.mock("../app-view-form", () => ({
  AppViewForm: vi.fn(({ appViews, submitLabel }) => (
    <form data-app-view-form="true">
      <span>{submitLabel}</span>
      <span data-app-view-options={appViews.map((view: { id: string }) => view.id).join(",")} />
    </form>
  )),
}));

const authMock = vi.mocked(auth);
const appViewConfigDiagnosticMock = vi.mocked(appViewConfigDiagnostic);
const getAuthorizedAppViewMock = vi.mocked(getAuthorizedAppView);
const isExpectedAppViewConfigParseErrorMock = vi.mocked(isExpectedAppViewConfigParseError);
const logAppViewConfigDiagnosticMock = vi.mocked(logAppViewConfigDiagnostic);
const parseAppViewConfigMock = vi.mocked(parseAppViewConfig);
const parseAppViewConfigForEditorMock = vi.mocked(parseAppViewConfigForEditor);

describe("AppViewDetailPage config loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user_1" } } as never);
    appViewConfigDiagnosticMock.mockReturnValue({
      code: "invalid_type",
      explanation: "La configuración guardada no coincide con el contrato actual de esta experiencia.",
      path: "datasets",
      reference: "appView=view_invalid;type=PANEL;code=invalid_type;path=datasets",
    });
    isExpectedAppViewConfigParseErrorMock.mockImplementation((error) => error instanceof Error && error.message === "Invalid config");
    parseAppViewConfigMock.mockImplementation((view) => (view.config ?? { type: view.type }) as AppViewConfig);
    parseAppViewConfigForEditorMock.mockImplementation((view) => ({
      config: (view.config ?? { type: view.type }) as AppViewConfig,
      repairablePanelTables: [],
    }));
  });

  it("opens invalid config in a controlled read-only state without save defaults", async () => {
    parseAppViewConfigForEditorMock.mockImplementation(() => {
      throw new Error("Invalid config");
    });
    parseAppViewConfigMock.mockImplementation((view) => {
      const appView = view as { config?: unknown; id: string; type: string };

      if (appView.id === "view_invalid") {
        throw new Error("Invalid config");
      }

      return (appView.config ?? { type: appView.type }) as AppViewConfig;
    });
    getAuthorizedAppViewMock.mockResolvedValue({
      appView: {
        active: true,
        config: { datasets: [] },
        icon: "folder",
        id: "view_invalid",
        name: "Panel Incompatible",
        slug: "panel-incompatible",
        sortOrder: 2,
        type: "PANEL",
      },
      appViews: [
        {
          active: true,
          config: { datasets: [] },
          icon: "folder",
          id: "view_invalid",
          name: "Panel Incompatible",
          slug: "panel-incompatible",
          sortOrder: 2,
          type: "PANEL",
        },
      ],
      entityTypes: [],
    } as never);

    const html = renderToStaticMarkup(await AppViewDetailPage({
      params: Promise.resolve({ appViewId: "view_invalid", contractId: "contract_1" }),
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain("Panel Incompatible");
    expect(html).toContain("Panel");
    expect(html).toContain("Configuración incompatible o inválida");
    expect(html).toContain("Copiar diagnóstico");
    expect(html).not.toContain('data-app-view-form="true"');
    expect(html).not.toContain("Guardar experiencia");
    expect(logAppViewConfigDiagnosticMock).toHaveBeenCalledTimes(1);
  });

  it("opens a PANEL with an empty TABLE as an identified repairable draft", async () => {
    const repairableConfig = {
      type: "PANEL",
      schemaVersion: 1,
      layout: { columns: 12, rowHeight: 8 },
      filters: [{ id: "status", label: "Estado", valueType: "OPTION" }],
      datasets: [{
        id: "people",
        source: { type: "ENTITY", entityTypeId: "people" },
        transformation: { type: "RECORDS", fieldIds: ["name"] },
      }],
      metrics: [],
      calculatedFields: [],
      modules: [{
        id: "people-table",
        title: "Personas sin columnas",
        datasetId: "people",
        visualization: { type: "TABLE", config: { columns: [] } },
        layout: { x: 0, y: 0, w: 12, h: 6 },
      }],
    } as AppViewConfig;
    parseAppViewConfigForEditorMock.mockReturnValue({
      config: repairableConfig,
      repairablePanelTables: [{ id: "people-table", title: "Personas sin columnas" }],
    });
    getAuthorizedAppViewMock.mockResolvedValue({
      appView: {
        active: true,
        config: repairableConfig,
        icon: "folder",
        id: "view_repairable",
        name: "Panel reparable",
        slug: "panel-reparable",
        sortOrder: 2,
        type: "PANEL",
      },
      appViews: [],
      entityTypes: [],
    } as never);

    const html = renderToStaticMarkup(await AppViewDetailPage({
      params: Promise.resolve({ appViewId: "view_repairable", contractId: "contract_1" }),
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain("Tabla pendiente de reparar");
    expect(html).toContain("Personas sin columnas");
    expect(html).toContain('data-app-view-form="true"');
    expect(html).toContain("Guardar experiencia");
    expect(html).not.toContain("Configuración incompatible o inválida");
    expect(logAppViewConfigDiagnosticMock).not.toHaveBeenCalled();
  });

  it("keeps editing a valid AppView when another AppView option has invalid config", async () => {
    parseAppViewConfigMock.mockImplementation((view) => {
      const appView = view as { config?: unknown; id: string; type: string };

      if (appView.id === "view_invalid") {
        throw new Error("Invalid config");
      }

      return (appView.config ?? { type: appView.type }) as AppViewConfig;
    });
    getAuthorizedAppViewMock.mockResolvedValue({
      appView: {
        active: true,
        config: { entityTypeId: "people" },
        icon: "folder",
        id: "view_valid",
        name: "Personas",
        slug: "personas",
        sortOrder: 1,
        type: "RECORDS",
      },
      appViews: [
        {
          active: true,
          config: { entityTypeId: "people" },
          icon: "folder",
          id: "view_valid",
          name: "Personas",
          slug: "personas",
          sortOrder: 1,
          type: "RECORDS",
        },
        {
          active: true,
          config: { datasets: [] },
          icon: "folder",
          id: "view_invalid",
          name: "Panel Incompatible",
          slug: "panel-incompatible",
          sortOrder: 2,
          type: "PANEL",
        },
        {
          active: true,
          config: { workflowKey: "state-update" },
          icon: "folder",
          id: "view_workflow",
          name: "Workflow",
          slug: "workflow",
          sortOrder: 3,
          type: "WORKFLOW",
        },
      ],
      entityTypes: [],
    } as never);

    const html = renderToStaticMarkup(await AppViewDetailPage({
      params: Promise.resolve({ appViewId: "view_valid", contractId: "contract_1" }),
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain('data-app-view-form="true"');
    expect(html).toContain("Guardar experiencia");
    expect(html).toContain('data-app-view-options="view_workflow"');
    expect(html).not.toContain('data-app-view-options="view_invalid"');
    expect(logAppViewConfigDiagnosticMock).toHaveBeenCalledWith(expect.objectContaining({
      view: expect.objectContaining({ id: "view_invalid", type: "PANEL" }),
    }));
  });
});
