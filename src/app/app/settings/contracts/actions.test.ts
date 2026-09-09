import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuthenticatedUser } from "@/lib/auth-guards";
import {
  contractAdminFriendlyError,
  createContractForAdmin,
} from "@/lib/contract-admin";

import { createContractAction } from "./actions";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/auth-guards", () => ({
  requireAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/contract-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/contract-admin")>()),
  contractAdminFriendlyError: vi.fn(),
  createContractForAdmin: vi.fn(),
}));

const createContractForAdminMock = vi.mocked(createContractForAdmin);
const contractAdminFriendlyErrorMock = vi.mocked(contractAdminFriendlyError);
const redirectMock = vi.mocked(redirect);
const revalidatePathMock = vi.mocked(revalidatePath);
const requireAuthenticatedUserMock = vi.mocked(requireAuthenticatedUser);

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserMock.mockResolvedValue({ id: "admin_1" } as never);
  contractAdminFriendlyErrorMock.mockReturnValue("No fue posible crear el contrato.");
});

describe("contract administration actions", () => {
  it("creates the first contract and makes it available for selection", async () => {
    createContractForAdminMock.mockResolvedValue({
      id: "contract_1",
      name: "Primer contrato",
      code: "FIRST-001",
    } as never);

    await expect(
      createContractAction(contractFormData({
        code: "FIRST-001",
        name: "Primer contrato",
        organizationId: "org_1",
        successTo: "/app/settings/contracts",
      })),
    ).rejects.toThrow("NEXT_REDIRECT:/app/settings/contracts?notice=Contrato+creado.");

    expect(createContractForAdminMock).toHaveBeenCalledWith("admin_1", {
      code: "FIRST-001",
      name: "Primer contrato",
      organizationId: "org_1",
      status: "ACTIVE",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/settings/contracts");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app");
    expect(redirectMock).toHaveBeenCalledWith(
      "/app/settings/contracts?notice=Contrato+creado.",
    );
  });

  it("rejects direct creation when the server-side RBAC check fails", async () => {
    createContractForAdminMock.mockRejectedValue(new Error("not allowed"));

    await expect(
      createContractAction(contractFormData({ organizationId: "org_1" })),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/app/settings/contracts?createContract=1&error=No+fue+posible+crear+el+contrato.",
    );

    expect(createContractForAdminMock).toHaveBeenCalledWith(
      "admin_1",
      expect.objectContaining({ organizationId: "org_1" }),
    );
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

function contractFormData({
  code = "NEW-001",
  name = "Nuevo contrato",
  organizationId,
  returnTo = "/app/settings/contracts?createContract=1",
  status = "ACTIVE",
  successTo = "/app/settings/contracts",
}: {
  code?: string;
  name?: string;
  organizationId?: string;
  returnTo?: string;
  status?: string;
  successTo?: string;
} = {}) {
  const formData = new FormData();

  formData.set("code", code);
  formData.set("name", name);
  formData.set("returnTo", returnTo);
  formData.set("status", status);
  formData.set("successTo", successTo);

  if (organizationId) {
    formData.set("organizationId", organizationId);
  }

  return formData;
}
