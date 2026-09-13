import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/auth";
import {
  getAppViewAdminData,
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
  getAppViewAdminData: vi.fn(),
  getAppViewTypeLabel: vi.fn((type: string) => ({
    BOARD: "Tablero",
    DASHBOARD: "Dashboard",
    PANEL: "Panel",
    RECORDS: "Registros",
    REPORT: "Reporte",
    WORKFLOW: "Flujo",
  }[type] ?? type)),
  parseAppViewConfig: vi.fn((view) => view.config ?? { type: view.type }),
  summarizeAppViewConfig: vi.fn(() => "Versionado"),
}));

vi.mock("./actions", () => ({
  toggleAppViewAction: vi.fn(),
}));

const authMock = vi.mocked(auth);
const getAppViewAdminDataMock = vi.mocked(getAppViewAdminData);
const parseAppViewConfigMock = vi.mocked(parseAppViewConfig);
const summarizeAppViewConfigMock = vi.mocked(summarizeAppViewConfig);

describe("AppViewsPage visual layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user_1" } } as never);
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
});
