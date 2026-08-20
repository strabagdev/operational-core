import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateEntityTypeAction } from "./actions";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectError(url);
  }),
  requireAuthenticatedUser: vi.fn(),
  revalidatePath: vi.fn(),
  updateEntityType: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/auth-guards", () => ({
  requireAuthenticatedUser: mocks.requireAuthenticatedUser,
}));

vi.mock("@/lib/entity-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/entity-config")>()),
  updateEntityType: mocks.updateEntityType,
}));

class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`Redirect: ${url}`);
  }
}

function entityTypeFormData(nature: string) {
  const formData = new FormData();

  formData.set("name", "Protocolos");
  formData.set("slug", "protocolos");
  formData.set("description", "");
  formData.set("icon", "");
  formData.set("nature", nature);
  formData.set("isActive", "true");

  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuthenticatedUser.mockResolvedValue({ id: "user_1" });
  mocks.updateEntityType.mockResolvedValue({ id: "entity_1" });
});

describe("entity type update action", () => {
  it("submits nature to the persistence layer", async () => {
    await expect(
      updateEntityTypeAction("contract_1", "entity_1", entityTypeFormData("REFERENCE")),
    ).rejects.toMatchObject({
      url: "/app/contracts/contract_1/settings/entities/entity_1?notice=Tipo+actualizado.",
    });

    expect(mocks.updateEntityType).toHaveBeenCalledWith(
      "contract_1",
      "entity_1",
      "user_1",
      expect.objectContaining({
        nature: "REFERENCE",
      }),
    );
  });

  it("revalidates and redirects after a successful update so reload reflects the persisted value", async () => {
    await expect(
      updateEntityTypeAction("contract_1", "entity_1", entityTypeFormData("MASTER")),
    ).rejects.toMatchObject({
      url: "/app/contracts/contract_1/settings/entities/entity_1?notice=Tipo+actualizado.",
    });

    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/app/contracts/contract_1/settings/entities/entity_1",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/app/contracts/contract_1/settings/entities/entity_1?notice=Tipo+actualizado.",
    );
  });
});
