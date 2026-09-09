import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/auth";
import { userCanManageContracts } from "@/lib/contract-admin";
import { getInactiveUserOrganizations, getUserContracts } from "@/lib/contracts";

import AppPage from "./page";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("@/lib/contracts", () => ({
  getInactiveUserOrganizations: vi.fn(),
  getUserContracts: vi.fn(),
}));

vi.mock("@/lib/contract-admin", () => ({
  userCanManageContracts: vi.fn(),
}));

function contract(overrides: Record<string, unknown> = {}) {
  return {
    code: "OPCO",
    id: "contract_1",
    membershipRole: "MEMBER",
    name: "Contrato",
    organization: {
      id: "org_1",
      name: "Organización",
    },
    ...overrides,
  };
}

describe("/app page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(userCanManageContracts).mockResolvedValue(false as never);
  });

  it("hides contract administration links from MEMBER users", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "member_1", platformRole: "NONE" },
    } as never);
    vi.mocked(getUserContracts).mockResolvedValueOnce([contract()] as never);
    vi.mocked(getInactiveUserOrganizations).mockResolvedValueOnce([] as never);

    const html = renderToStaticMarkup(await AppPage());

    expect(html).toContain("Abrir contrato");
    expect(html).not.toContain("Usuarios");
    expect(html).not.toContain("Administrar contratos");
    expect(html).not.toContain("Aplicaciones externas");
    expect(html).not.toContain("Organizaciones");
  });

  it("shows contract administration links to ADMIN users", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "admin_1", platformRole: "NONE" },
    } as never);
    vi.mocked(getUserContracts).mockResolvedValueOnce([
      contract({ membershipRole: "ADMIN" }),
    ] as never);
    vi.mocked(getInactiveUserOrganizations).mockResolvedValueOnce([] as never);

    const html = renderToStaticMarkup(await AppPage());

    expect(html).toContain("Usuarios");
    expect(html).toContain("Administrar contratos");
    expect(html).toContain("Aplicaciones externas");
  });

  it("does not grant contract administration to PLATFORM_ADMIN without membership admin", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "platform_1", platformRole: "PLATFORM_ADMIN" },
    } as never);
    vi.mocked(getUserContracts).mockResolvedValueOnce([] as never);
    vi.mocked(getInactiveUserOrganizations).mockResolvedValueOnce([] as never);

    const html = renderToStaticMarkup(await AppPage());

    expect(html).toContain("Organizaciones");
    expect(html).not.toContain("Administrar contratos");
    expect(html).not.toContain("Usuarios");
    expect(html).not.toContain("Aplicaciones externas");
  });

  it("renders /app with navigation and logout for an authenticated user with zero contracts", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: {
        email: "empty@operational-core.local",
        id: "empty_1",
        image: null,
        name: "Sin Contratos",
        platformRole: "NONE",
      },
    } as never);
    vi.mocked(getUserContracts).mockResolvedValueOnce([] as never);
    vi.mocked(getInactiveUserOrganizations).mockResolvedValueOnce([] as never);

    const html = renderToStaticMarkup(await AppPage());

    expect(html).toContain("No hay contratos disponibles para tu usuario.");
    expect(html).toContain("Navegación principal");
    expect(html).toContain('href="/app"');
    expect(html).toContain("Menú de usuario");
    expect(html).toContain("SC");
    expect(html).not.toContain("Crear contrato");
    expect(html).not.toContain("/app/contracts/");
  });

  it("shows a first-contract creation action to organization admins with zero contracts", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: {
        email: "admin@operational-core.local",
        id: "admin_1",
        image: null,
        name: "Admin Org",
        platformRole: "NONE",
      },
    } as never);
    vi.mocked(getUserContracts).mockResolvedValueOnce([] as never);
    vi.mocked(getInactiveUserOrganizations).mockResolvedValueOnce([] as never);
    vi.mocked(userCanManageContracts).mockResolvedValueOnce(true as never);

    const html = renderToStaticMarkup(await AppPage());

    expect(html).toContain("No hay contratos disponibles para tu usuario.");
    expect(html).toContain("Crear contrato");
    expect(html).toContain('/app/settings/contracts?createContract=1');
    expect(html).toContain("Menú de usuario");
    expect(html).not.toContain("/app/contracts/");
  });

  it("keeps the contract selection flow for users with contracts", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "member_1", platformRole: "NONE" },
    } as never);
    vi.mocked(getUserContracts).mockResolvedValueOnce([contract()] as never);
    vi.mocked(getInactiveUserOrganizations).mockResolvedValueOnce([] as never);

    const html = renderToStaticMarkup(await AppPage());

    expect(html).toContain("Abrir contrato");
    expect(html).toContain('/app/contracts/contract_1');
    expect(html).toContain("Contrato");
    expect(html).not.toContain("No hay contratos disponibles para tu usuario.");
  });
});
