import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createEntityRecordAction,
  updateEntityRecordAction,
} from "./actions";
import { FieldValidationError } from "@/lib/entity-records";

const mocks = vi.hoisted(() => ({
  createEntityRecord: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new RedirectError(url);
  }),
  requireAuthenticatedUser: vi.fn(),
  revalidatePath: vi.fn(),
  updateEntityRecord: vi.fn(),
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

vi.mock("@/lib/entity-records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/entity-records")>()),
  createEntityRecord: mocks.createEntityRecord,
  updateEntityRecord: mocks.updateEntityRecord,
}));

class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`Redirect: ${url}`);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuthenticatedUser.mockResolvedValue({ id: "user_1" });
});

describe("entity record save redirects", () => {
  it("redirects create success to the canonical record detail URL", async () => {
    mocks.createEntityRecord.mockResolvedValue({ id: "record_1" });

    await expect(
      createEntityRecordAction("contract_1", "entity_1", new FormData()),
    ).rejects.toMatchObject({
      url: "/app/contracts/contract_1/records/entity_1/record_1",
    });
  });

  it("keeps create errors on the create form and preserves submitted values", async () => {
    mocks.createEntityRecord.mockRejectedValue(
      new FieldValidationError({ field_name: ["Nombre es requerido."] }),
    );
    const formData = new FormData();

    formData.set("field_name", "Ana");

    await expect(
      createEntityRecordAction("contract_1", "entity_1", formData),
    ).rejects.toSatisfy((error: unknown) => {
      const url = error instanceof RedirectError ? error.url : "";

      return (
        url.startsWith("/app/contracts/contract_1/records/entity_1/new?") &&
        url.includes("fieldErrors=") &&
        url.includes("formValues=") &&
        !url.includes("returnTo=")
      );
    });
  });

  it("redirects edit success to read mode with a success notice", async () => {
    mocks.updateEntityRecord.mockResolvedValue({ id: "record_1" });

    await expect(
      updateEntityRecordAction("contract_1", "entity_1", "record_1", new FormData()),
    ).rejects.toMatchObject({
      url: "/app/contracts/contract_1/records/entity_1/record_1?notice=Cambios+guardados.",
    });
  });

  it("keeps edit errors in edit mode and preserves submitted values", async () => {
    mocks.updateEntityRecord.mockRejectedValue(
      new FieldValidationError({ field_name: ["Nombre es requerido."] }),
    );
    const formData = new FormData();

    formData.set("field_name", "Ana corregida");

    await expect(
      updateEntityRecordAction("contract_1", "entity_1", "record_1", formData),
    ).rejects.toSatisfy((error: unknown) => {
      const url = error instanceof RedirectError ? error.url : "";

      return (
        url.startsWith("/app/contracts/contract_1/records/entity_1/record_1?") &&
        url.includes("edit=1") &&
        url.includes("fieldErrors=") &&
        url.includes("formValues=")
      );
    });
  });

  it("does not keep edit parameters after a successful edit", async () => {
    mocks.updateEntityRecord.mockResolvedValue({ id: "record_1" });

    await expect(
      updateEntityRecordAction("contract_1", "entity_1", "record_1", new FormData()),
    ).rejects.toSatisfy((error: unknown) => {
      const url = error instanceof RedirectError ? error.url : "";

      return !url.includes("edit=1") && !url.includes("mode=edit");
    });
  });
});
