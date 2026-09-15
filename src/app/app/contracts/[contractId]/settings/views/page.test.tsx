import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/auth";
import {
  appViewConfigDiagnostic,
  type AppViewConfig,
  getAppViewAdminData,
  isExpectedAppViewConfigParseError,
  logAppViewConfigDiagnostic,
  parseAppViewConfig,
  summarizeAppViewConfig,
} from "@/lib/app-views";

import AppViewsPage from "./page";

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
  getAppViewAdminData: vi.fn(),
  getAppViewTypeLabel: vi.fn((type: string) => ({
    BOARD: "Tablero",
    DASHBOARD: "Dashboard",
    PANEL: "Panel",
    RECORDS: "Registros",
    REPORT: "Reporte",
    WORKFLOW: "Flujo",
  }[type] ?? type)),
  isExpectedAppViewConfigParseError: vi.fn((error) => error instanceof Error && error.message === "Invalid config"),
  logAppViewConfigDiagnostic: vi.fn(),
  parseAppViewConfig: vi.fn((view) => (view.config ?? { type: view.type }) as AppViewConfig),
  summarizeAppViewConfig: vi.fn(() => "Versionado"),
}));

vi.mock("./actions", () => ({
  toggleAppViewAction: vi.fn(),
}));

const authMock = vi.mocked(auth);
const appViewConfigDiagnosticMock = vi.mocked(appViewConfigDiagnostic);
const getAppViewAdminDataMock = vi.mocked(getAppViewAdminData);
const isExpectedAppViewConfigParseErrorMock = vi.mocked(isExpectedAppViewConfigParseError);
const logAppViewConfigDiagnosticMock = vi.mocked(logAppViewConfigDiagnostic);
const parseAppViewConfigMock = vi.mocked(parseAppViewConfig);
const summarizeAppViewConfigMock = vi.mocked(summarizeAppViewConfig);

describe("AppViewsPage visual layout", () => {
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
    summarizeAppViewConfigMock.mockReturnValue("Versionado");
  });

  it("keeps app view information, icons, links and actions", async () => {
    getAppViewAdminDataMock.mockResolvedValue({
      appViews: [
        {
          active: true,
          config: { type: "PANEL" },
          icon: "folder",
          id: "view_1",
          name: "Panel Procedimientos con título extremadamente largo",
          slug: "panel-procedimientos-piloto",
          sortOrder: 1,
          type: "PANEL",
        },
        {
          active: false,
          config: { type: "REPORT" },
          icon: "clipboard-check",
          id: "view_2",
          name: "Dashboard Procedimientos",
          slug: "dashboard-procedimientos",
          sortOrder: 2,
          type: "REPORT",
        },
      ],
      entityTypes: [{ id: "versions", name: "Versionado" }],
    } as never);

    const html = renderToStaticMarkup(await AppViewsPage({
      params: Promise.resolve({ contractId: "contract_1" }),
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain("Experiencias");
    expect(html).toContain("Asignar usuarios");
    expect(html).toContain("/app/contracts/contract_1/settings/views/access");
    expect(html).toContain("Crear experiencia");
    expect(html).toContain("/app/contracts/contract_1/settings/views/new");
    expect(html).toContain("Panel Procedimientos con título extremadamente largo");
    expect(html).toContain("panel-procedimientos-piloto");
    expect(html).toContain("Panel");
    expect(html).toContain("Reporte");
    expect(html).toContain("Activa");
    expect(html).toContain("Inactiva");
    expect(html).toContain("Orden");
    expect(html).toContain("Versionado");
    expect(html).toContain("/app/contracts/contract_1/settings/views/view_1");
    expect(html).toContain("Editar");
    expect(html).toContain("Desactivar");
    expect(html).toContain("Activar");
    expect(html).toContain("<svg");
    expect(html).toContain('data-summary-card="true"');
    expect(html).toContain('data-summary-card-actions="true"');
    expect(html).toContain("min-w-0 flex-1");
    expect(parseAppViewConfigMock).toHaveBeenCalledTimes(2);
    expect(summarizeAppViewConfigMock).toHaveBeenCalledTimes(2);
  });

  it("renders action messages and empty states without losing navigation", async () => {
    getAppViewAdminDataMock.mockResolvedValue({
      appViews: [],
      entityTypes: [],
    } as never);

    const html = renderToStaticMarkup(await AppViewsPage({
      params: Promise.resolve({ contractId: "contract_1" }),
      searchParams: Promise.resolve({ notice: "Experiencia actualizada." }),
    }));

    expect(html).toContain("Experiencia actualizada.");
    expect(html).toContain('role="status"');
    expect(html).toContain("Todavía no hay experiencias configuradas.");
    expect(html).toContain('data-empty-state="true"');
    expect(html).toContain("/app/contracts/contract_1/settings/views/new");
    expect(html).toContain("/app/contracts/contract_1/settings/views/access");
  });

  it("isolates invalid AppView config in its own card without hiding valid views", async () => {
    parseAppViewConfigMock.mockImplementation((view) => {
      const appView = view as { config?: unknown; id: string; type: string };

      if (appView.id === "view_invalid") {
        throw new Error("Invalid config");
      }

      return (appView.config ?? { type: appView.type }) as AppViewConfig;
    });
    getAppViewAdminDataMock.mockResolvedValue({
      appViews: [
        {
          active: true,
          config: { type: "PANEL" },
          icon: "folder",
          id: "view_valid_1",
          name: "Panel Operativo",
          slug: "panel-operativo",
          sortOrder: 1,
          type: "PANEL",
        },
        {
          active: true,
          config: { datasets: [] },
          icon: "clipboard-check",
          id: "view_invalid",
          name: "Panel Incompatible",
          slug: "panel-incompatible",
          sortOrder: 2,
          type: "PANEL",
        },
        {
          active: false,
          config: { type: "REPORT" },
          icon: null,
          id: "view_valid_2",
          name: "Reporte Vigente",
          slug: "reporte-vigente",
          sortOrder: 3,
          type: "REPORT",
        },
      ],
      entityTypes: [{ id: "versions", name: "Versionado" }],
    } as never);

    const html = renderToStaticMarkup(await AppViewsPage({
      params: Promise.resolve({ contractId: "contract_1" }),
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain("Panel Operativo");
    expect(html).toContain("Reporte Vigente");
    expect(html).toContain("Panel Incompatible");
    expect(html).toContain("Configuración incompatible o inválida");
    expect(html).toContain("La configuración guardada no coincide con el contrato actual de esta experiencia.");
    expect(html).toContain("Copiar diagnóstico");
    expect(html).toContain("Revisar");
    expect(html).toContain("/app/contracts/contract_1/settings/views/view_invalid");
    expect(html).toContain("Desactivar");
    expect(html).toContain("Activar");
    expect(summarizeAppViewConfigMock).toHaveBeenCalledTimes(2);
    expect(appViewConfigDiagnosticMock).toHaveBeenCalledTimes(1);
    expect(logAppViewConfigDiagnosticMock).toHaveBeenCalledWith(expect.objectContaining({
      view: expect.objectContaining({ id: "view_invalid", type: "PANEL" }),
    }));
  });

  it("does not hide unexpected AppView parse failures", async () => {
    const unexpected = new Error("Database connection closed");
    isExpectedAppViewConfigParseErrorMock.mockReturnValue(false);
    parseAppViewConfigMock.mockImplementation(() => {
      throw unexpected;
    });
    getAppViewAdminDataMock.mockResolvedValue({
      appViews: [
        {
          active: true,
          config: { type: "PANEL" },
          icon: "folder",
          id: "view_1",
          name: "Panel Operativo",
          slug: "panel-operativo",
          sortOrder: 1,
          type: "PANEL",
        },
      ],
      entityTypes: [],
    } as never);

    await expect(AppViewsPage({
      params: Promise.resolve({ contractId: "contract_1" }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow(unexpected);
  });
});
