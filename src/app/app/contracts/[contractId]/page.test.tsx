import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/auth";
import { getAuthorizedContract } from "@/lib/contracts";

import ContractSummaryPage from "./page";

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

vi.mock("@/lib/contracts", () => ({
  getAuthorizedContract: vi.fn(),
}));

const authMock = vi.mocked(auth);
const getAuthorizedContractMock = vi.mocked(getAuthorizedContract);

describe("ContractSummaryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user_1" } } as never);
  });

  it("shows real contract context and member access cards only", async () => {
    getAuthorizedContractMock.mockResolvedValue(contract() as never);

    const html = renderToStaticMarkup(await ContractSummaryPage({
      params: Promise.resolve({ contractId: "contract_1" }),
    }));

    expect(getAuthorizedContractMock).toHaveBeenCalledWith("contract_1", "user_1");
    expect(html).toContain("Contrato Operacional con nombre largo");
    expect(html).toContain("Descripción real del contrato");
    expect(html).toContain("OPCO-001");
    expect(html).toContain("Organización Demo");
    expect(html).toContain("Activo");
    expect(html).toContain("Accesos principales");
    expect(html).toContain("Registros");
    expect(html).toContain("/app/contracts/contract_1/records");
    expect(html).toContain("Actividad");
    expect(html).toContain("/app/contracts/contract_1/activity");
    expect(html).not.toContain("/app/contracts/contract_1/settings");
    expect(html).toContain('data-summary-card="true"');
    expect(html).toContain('data-summary-card-actions="true"');
  });

  it("shows settings only when contract navigation authorizes the user", async () => {
    getAuthorizedContractMock.mockResolvedValue(contract({ membershipRole: "ADMIN" }) as never);

    const html = renderToStaticMarkup(await ContractSummaryPage({
      params: Promise.resolve({ contractId: "contract_1" }),
    }));

    expect(html).toContain("Configuración");
    expect(html).toContain("/app/contracts/contract_1/settings");
  });
});

function contract(overrides: Record<string, unknown> = {}) {
  return {
    code: "OPCO-001",
    description: "Descripción real del contrato",
    id: "contract_1",
    membershipRole: "MEMBER",
    name: "Contrato Operacional con nombre largo",
    organization: {
      id: "org_1",
      name: "Organización Demo",
    },
    status: "ACTIVE",
    ...overrides,
  };
}
