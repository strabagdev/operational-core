import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/auth";
import { getAuthorizedContractAdmin } from "@/lib/contracts";

import SettingsPage from "./page";

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
  getAuthorizedContractAdmin: vi.fn(),
}));

const authMock = vi.mocked(auth);
const getAuthorizedContractAdminMock = vi.mocked(getAuthorizedContractAdmin);

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "admin_1" } } as never);
  });

  it("renders the authorized settings modules with icons and contained actions", async () => {
    getAuthorizedContractAdminMock.mockResolvedValue(contract() as never);

    const html = renderToStaticMarkup(await SettingsPage({
      params: Promise.resolve({ contractId: "contract_1" }),
    }));

    expect(getAuthorizedContractAdminMock).toHaveBeenCalledWith("contract_1", "admin_1");
    expect(html).toContain("Configuración");
    expect(html).toContain("Contrato Demo");
    expect(html).toContain("Organización Demo");
    expect(html).toContain("Tipos de entidad");
    expect(html).toContain("/app/contracts/contract_1/settings/entities");
    expect(html).toContain("Experiencias");
    expect(html).toContain("/app/contracts/contract_1/settings/views");
    expect(html).toContain("Aplicaciones externas");
    expect(html).toContain("/app/settings/apps");
    expect(html).toContain("<svg");
    expect(html).toContain('data-summary-card="true"');
    expect(html).toContain('data-summary-card-actions="true"');
    expect(html).toContain("min-w-0 flex-1");
  });

  it("does not render settings modules when admin authorization fails", async () => {
    getAuthorizedContractAdminMock.mockResolvedValue(null);

    await expect(SettingsPage({
      params: Promise.resolve({ contractId: "contract_1" }),
    })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

function contract() {
  return {
    code: "OPCO-001",
    description: null,
    id: "contract_1",
    membershipRole: "ADMIN",
    name: "Contrato Demo",
    organization: {
      id: "org_1",
      name: "Organización Demo",
    },
    status: "ACTIVE",
  };
}
