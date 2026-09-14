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
    expect(html).toContain('href="/app/settings/users"');
    expect(html).toContain('href="/app/settings/contracts"');
    expect(html).toContain('href="/app/settings/apps"');
    expect(countOccurrences(html, 'href="/app/settings/users"')).toBe(1);
    expect(countOccurrences(html, 'href="/app/settings/contracts"')).toBe(1);
    expect(countOccurrences(html, 'href="/app/settings/apps"')).toBe(1);
    expect(countOccurrences(html, "Administrar contratos")).toBe(1);
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

  it("renders multiple contracts with organization metadata and contained actions", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "member_1", platformRole: "NONE" },
    } as never);
    vi.mocked(getUserContracts).mockResolvedValueOnce([
      contract({
        code: "CODIGO-LARGO-UNO",
        id: "contract_1",
        name: "Contrato Norte con nombre muy largo",
        organization: { id: "org_1", name: "Organización Norte" },
      }),
      contract({
        code: "CODIGO-LARGO-DOS",
        id: "contract_2",
        name: "Contrato Sur",
        organization: { id: "org_2", name: "Organización Sur" },
      }),
    ] as never);
    vi.mocked(getInactiveUserOrganizations).mockResolvedValueOnce([] as never);

    const html = renderToStaticMarkup(await AppPage());

    expect(html).toContain("2 contratos disponibles");
    expect(html).toContain("Contrato Norte con nombre muy largo");
    expect(html).toContain("Organización Norte");
    expect(html).toContain("CODIGO-LARGO-UNO");
    expect(html).toContain("/app/contracts/contract_1");
    expect(html).toContain("/app/contracts/contract_2");
    expect(html).toContain('data-summary-card="true"');
    expect(html).toContain('data-summary-card-actions="true"');
    expect(html).toContain("min-w-0 flex-1");
    expect(html).toContain("Activo");
  });

  it("shows inactive organizations as a warning without changing contract selection", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "member_1", platformRole: "NONE" },
    } as never);
    vi.mocked(getUserContracts).mockResolvedValueOnce([contract()] as never);
    vi.mocked(getInactiveUserOrganizations).mockResolvedValueOnce([
      { id: "org_inactive", name: "Organización pausada" },
    ] as never);

    const html = renderToStaticMarkup(await AppPage());

    expect(html).toContain("Esta organización se encuentra inactiva.");
    expect(html).toContain("Organización pausada");
    expect(html).toContain("/app/contracts/contract_1");
  });
});

function countOccurrences(value: string, pattern: string) {
  return value.split(pattern).length - 1;
}
