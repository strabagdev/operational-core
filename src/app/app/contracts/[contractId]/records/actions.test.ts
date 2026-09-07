import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.requireAuthenticatedUser.mockResolvedValue({ id: "user_1" });
});

afterEach(() => {
  vi.restoreAllMocks();
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

  it("preserves domain error messages on edit", async () => {
    const error = new Error("Cargo contiene registros relacionados no válidos.");

    error.name = "UserFacingError";
    mocks.updateEntityRecord.mockRejectedValue(error);

    await expectUpdateRedirectMessage(
      new FormData(),
      "Cargo contiene registros relacionados no válidos.",
    );

    expect(console.error).not.toHaveBeenCalled();
  });

  it("maps P2003 relation constraints to a friendly edit message", async () => {
    mocks.updateEntityRecord.mockRejectedValue(
      prismaKnownError(
        "P2003",
        "Foreign key constraint failed on the field: EntityRelation_targetRecordId_fkey",
        { field_name: "EntityRelation_targetRecordId_fkey" },
      ),
    );

    await expectUpdateRedirectMessage(
      new FormData(),
      "No fue posible guardar los cambios porque el registro está relacionado con otros datos.",
    );

    expect(console.error).toHaveBeenCalledWith(
      "Record update error",
      expect.objectContaining({
        operation: "updateEntityRecord",
        contractId: "contract_1",
        entityTypeId: "entity_1",
        recordId: "record_1",
        errorName: "PrismaClientKnownRequestError",
        prismaCode: "P2003",
      }),
    );
  });

  it("maps P2025 missing records to a friendly edit message", async () => {
    mocks.updateEntityRecord.mockRejectedValue(
      prismaKnownError("P2025", "Record to update not found.", {
        modelName: "EntityRecord",
      }),
    );

    await expectUpdateRedirectMessage(
      new FormData(),
      "El registro ya no existe o fue modificado.",
    );
  });

  it("maps Prisma initialization errors to a temporary persistence message", async () => {
    mocks.updateEntityRecord.mockRejectedValue(
      new Prisma.PrismaClientInitializationError(
        "Can't reach database server at db.example.test:5432",
        "6.19.3",
        "P1001",
      ),
    );

    await expectUpdateRedirectMessage(
      new FormData(),
      "No fue posible guardar los cambios por un problema temporal. Intenta nuevamente.",
    );
  });

  it("maps Prisma unknown request errors to a temporary persistence message", async () => {
    mocks.updateEntityRecord.mockRejectedValue(
      new Prisma.PrismaClientUnknownRequestError(
        "Transaction already closed.",
        { clientVersion: "6.19.3" },
      ),
    );

    await expectUpdateRedirectMessage(
      new FormData(),
      "No fue posible guardar los cambios por un problema temporal. Intenta nuevamente.",
    );
  });

  it("maps unknown exceptions to a generic save message without leaking technical details", async () => {
    const formData = new FormData();

    formData.set("field_name", "Ana corregida");
    mocks.updateEntityRecord.mockRejectedValue(
      new Error("database exploded while writing EntityRelation_targetRecordId_fkey"),
    );

    await expect(
      updateEntityRecordAction("contract_1", "entity_1", "record_1", formData),
    ).rejects.toSatisfy((error: unknown) => {
      const url = error instanceof RedirectError ? error.url : "";

      return (
        url.includes("error=No+fue+posible+guardar+los+cambios.") &&
        !url.includes("database+exploded") &&
        !url.includes("EntityRelation_targetRecordId_fkey")
      );
    });
  });
});

function prismaKnownError(
  code: string,
  message: string,
  meta?: Record<string, unknown>,
) {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: "6.19.3",
    meta,
  });
}

async function expectUpdateRedirectMessage(formData: FormData, message: string) {
  await expect(
    updateEntityRecordAction("contract_1", "entity_1", "record_1", formData),
  ).rejects.toSatisfy((error: unknown) => {
    const url = error instanceof RedirectError ? error.url : "";

    return (
      url.startsWith("/app/contracts/contract_1/records/entity_1/record_1?") &&
      url.includes("edit=1") &&
      new URLSearchParams(url.split("?")[1] ?? "").get("error") === message
    );
  });
}
