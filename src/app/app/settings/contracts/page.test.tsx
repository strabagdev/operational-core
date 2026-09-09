import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/auth";
import { getContractAdministration } from "@/lib/contract-admin";

import ContractAdministrationPage from "./page";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  useRouter: vi.fn(() => ({
    replace: vi.fn(),
  })),
}));

vi.mock("@/lib/contract-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/contract-admin")>()),
  getContractAdministration: vi.fn(),
}));

const authMock = vi.mocked(auth);
const getContractAdministrationMock = vi.mocked(getContractAdministration);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("contract administration page", () => {
  it("lets an organization admin with zero contracts open the first-contract form", async () => {
    authMock.mockResolvedValueOnce({
      user: {
        email: "admin@operational-core.local",
        id: "admin_1",
        image: null,
        name: "Admin Org",
      },
    } as never);
    getContractAdministrationMock.mockResolvedValueOnce({
      contracts: [],
      organizations: [{ id: "org_1", name: "Organización" }],
    } as never);

    const html = renderToStaticMarkup(
      await ContractAdministrationPage({
        searchParams: Promise.resolve({ createContract: "1" }),
      }),
    );

    expect(html).toContain("Contratos");
    expect(html).toContain("No hay contratos para estos filtros.");
    expect(html).toContain("Nuevo contrato");
    expect(html).toContain('/app/settings/contracts?createContract=1');
    expect(html).toContain("Menú de usuario");
    expect(html).not.toContain("NEXT_NOT_FOUND");
  });

  it("keeps the current administration flow for admins with existing contracts", async () => {
    authMock.mockResolvedValueOnce({
      user: { id: "admin_1" },
    } as never);
    getContractAdministrationMock.mockResolvedValueOnce({
      contracts: [
        {
          code: "EXIST-001",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          id: "contract_1",
          name: "Contrato existente",
          organization: { id: "org_1", name: "Organización" },
          organizationId: "org_1",
          status: "ACTIVE",
          updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      ],
      organizations: [{ id: "org_1", name: "Organización" }],
    } as never);

    const html = renderToStaticMarkup(
      await ContractAdministrationPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain("Contrato existente");
    expect(html).toContain("EXIST-001");
    expect(html).toContain("Nuevo contrato");
    expect(html).not.toContain("No hay contratos para estos filtros.");
  });
});
