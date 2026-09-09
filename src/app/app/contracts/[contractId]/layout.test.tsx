import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/auth";
import { getAuthorizedContract } from "@/lib/contracts";

import ContractLayout from "./layout";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  usePathname: vi.fn(() => "/app/contracts/contract_1"),
  useSelectedLayoutSegments: vi.fn(() => []),
}));

vi.mock("@/lib/contracts", () => ({
  getAuthorizedContract: vi.fn(),
}));

function session() {
  return {
    user: {
      email: "user@operational-core.local",
      id: "user_1",
      image: null,
      name: "Usuaria Opco",
    },
  };
}

function contract(overrides: Record<string, unknown> = {}) {
  return {
    code: "OPCO",
    id: "contract_1",
    membershipRole: "MEMBER",
    name: "Contrato vigente",
    organization: {
      id: "org_1",
      name: "Organización",
    },
    ...overrides,
  };
}

describe("contract layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a navigable empty state for an invalid persisted contract route", async () => {
    vi.mocked(auth).mockResolvedValueOnce(session() as never);
    vi.mocked(getAuthorizedContract).mockResolvedValueOnce(null as never);

    const html = renderToStaticMarkup(
      await ContractLayout({
        children: <div>contract scoped data</div>,
        params: Promise.resolve({ contractId: "stale_contract" }),
      }),
    );

    expect(getAuthorizedContract).toHaveBeenCalledWith("stale_contract", "user_1");
    expect(html).toContain("Contrato no disponible");
    expect(html).toContain("ya no está disponible para tu usuario");
    expect(html).toContain('href="/app"');
    expect(html).toContain("Menú de usuario");
    expect(html).not.toContain("contract scoped data");
    expect(html).not.toContain("/app/contracts/stale_contract/records");
  });

  it("keeps the current contract navigation for authorized contracts", async () => {
    vi.mocked(auth).mockResolvedValueOnce(session() as never);
    vi.mocked(getAuthorizedContract).mockResolvedValueOnce(contract() as never);

    const html = renderToStaticMarkup(
      await ContractLayout({
        children: <div>contract scoped data</div>,
        params: Promise.resolve({ contractId: "contract_1" }),
      }),
    );

    expect(html).toContain("Contrato vigente");
    expect(html).toContain("/app/contracts/contract_1/records");
    expect(html).toContain("contract scoped data");
    expect(html).not.toContain("Contrato no disponible");
  });
});
