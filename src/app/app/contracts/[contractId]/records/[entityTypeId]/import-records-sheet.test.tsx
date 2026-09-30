import { describe, expect, it, vi } from "vitest";

import { ENTITY_IMPORT_LIMITS } from "@/lib/entity-import-limits";

import {
  importValidationSummary,
  selectedImportFileError,
  settleImportRequest,
} from "./import-records-sheet";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("../actions", () => ({
  importEntityRecordsAction: vi.fn(),
}));

describe("ImportRecordsSheet request state", () => {
  it("rejects a file above 5 MiB before submission", () => {
    const file = new File([new Uint8Array(ENTITY_IMPORT_LIMITS.maxFileSizeBytes + 1)], "datos.xlsx");

    expect(selectedImportFileError(file)).toBe("El archivo no puede superar 5 MB.");
  });

  it("ends validation loading and allows a successful retry when the action rejects", async () => {
    const pending: boolean[] = [];

    const rejected = await settleImportRequest({
      intent: "validate",
      request: async () => {
        throw new Error("request body rejected");
      },
      setPending: (value) => pending.push(value),
    });

    expect(rejected).toEqual({
      status: "error",
      message: "No fue posible validar el archivo. Inténtalo nuevamente.",
    });

    const retried = await settleImportRequest({
      intent: "validate",
      request: async () => ({ status: "valid", message: "Archivo validado correctamente." }),
      setPending: (value) => pending.push(value),
    });

    expect(retried.status).toBe("valid");
    expect(pending).toEqual([true, false, true, false]);
  });

  it("builds the visible summary from a successful validation response", async () => {
    const pending: boolean[] = [];

    const result = await settleImportRequest({
      intent: "validate",
      request: async () => ({
        status: "valid",
        message: "Archivo validado correctamente.",
        rowsRead: 3,
        validRows: 3,
        createdCount: 2,
        updatedCount: 1,
        changeCount: 4,
        errorRows: 0,
      }),
      setPending: (value) => pending.push(value),
    });

    expect(importValidationSummary(result)).toEqual([
      { label: "Filas leídas", value: 3 },
      { label: "Nuevos", value: 2 },
      { label: "Actualizaciones", value: 1 },
      { label: "Cambios", value: 4 },
      { label: "Con errores", value: 0 },
    ]);
    expect(pending).toEqual([true, false]);
  });
});
