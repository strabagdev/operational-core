import { describe, expect, it } from "vitest";

import { MAX_FIELD_OPTIONS } from "./field-editor-state";
import {
  createOptionRow,
  filterOptionRows,
  getDuplicateOptionErrors,
  getOptionSummary,
  initialOptionRows,
  moveOption,
  parseBulkOptions,
  removePersistedOption,
  removeNewOption,
  toggleOptionActive,
  updateOptionLabel,
  updateOptionValue,
} from "./field-options-editor-state";

describe("field options editor state", () => {
  it("starts without placeholder options when no saved options exist", () => {
    expect(initialOptionRows()).toEqual([]);
  });

  it("creates option rows with normalized internal values", () => {
    expect(createOptionRow("En mantención")).toMatchObject({
      label: "En mantención",
      value: "en_mantencion",
      isActive: true,
      sortOrder: 1,
      editing: true,
    });
  });

  it("keeps auto-generating values until the value is edited manually", () => {
    const first = createOptionRow("Activo");
    const renamed = updateOptionLabel(first, "En revisión");
    const manual = updateOptionValue(renamed, "Revision manual");
    const renamedAgain = updateOptionLabel(manual, "Finalizado");

    expect(renamed.value).toBe("en_revision");
    expect(manual).toMatchObject({
      value: "revision_manual",
      valueTouched: true,
    });
    expect(renamedAgain.value).toBe("revision_manual");
  });

  it("parses pasted options by trimmed non-empty lines", () => {
    const result = parseBulkOptions(" Activo \n\n Inactivo \r\n Pendiente ", []);

    expect(result.detectedCount).toBe(3);
    expect(result.duplicateCount).toBe(0);
    expect(result.limitExceeded).toBe(false);
    expect(result.rows.map((row) => [row.label, row.value])).toEqual([
      ["Activo", "activo"],
      ["Inactivo", "inactivo"],
      ["Pendiente", "pendiente"],
    ]);
  });

  it("omits pasted duplicates against existing and within the pasted text", () => {
    const existing = [
      createOptionRow("Activo", { value: "activo", editing: false }),
      createOptionRow("En revisión", { value: "en_revision", editing: false }),
    ];
    const result = parseBulkOptions(
      "activo\nNuevo\nEn Revision\nNuevo\nEn revisión",
      existing,
    );

    expect(result.detectedCount).toBe(5);
    expect(result.duplicateCount).toBe(4);
    expect(result.limitExceeded).toBe(false);
    expect(result.rows.map((row) => row.label)).toEqual(["Nuevo"]);
  });

  it("accepts 500 pasted options", () => {
    const text = Array.from(
      { length: MAX_FIELD_OPTIONS },
      (_, index) => `Opción ${index}`,
    ).join("\n");
    const result = parseBulkOptions(text, []);

    expect(result.detectedCount).toBe(MAX_FIELD_OPTIONS);
    expect(result.rows).toHaveLength(MAX_FIELD_OPTIONS);
    expect(result.limitExceeded).toBe(false);
  });

  it("rejects 501 pasted options without truncating the parsed result", () => {
    const text = Array.from(
      { length: MAX_FIELD_OPTIONS + 1 },
      (_, index) => `Opción ${index}`,
    ).join("\n");
    const result = parseBulkOptions(text, []);

    expect(result.detectedCount).toBe(MAX_FIELD_OPTIONS + 1);
    expect(result.rows).toHaveLength(MAX_FIELD_OPTIONS + 1);
    expect(result.limitExceeded).toBe(true);
  });

  it("handles duplicates within 500 pasted options using the existing logic", () => {
    const uniqueOptions = Array.from(
      { length: MAX_FIELD_OPTIONS - 1 },
      (_, index) => `Opción ${index}`,
    );
    const result = parseBulkOptions([...uniqueOptions, "Opción 1"].join("\n"), []);

    expect(result.detectedCount).toBe(MAX_FIELD_OPTIONS);
    expect(result.duplicateCount).toBe(1);
    expect(result.rows).toHaveLength(MAX_FIELD_OPTIONS - 1);
    expect(result.limitExceeded).toBe(false);
  });

  it("moves rows and normalizes sort order", () => {
    const rows = [
      createOptionRow("Uno", { sortOrder: 1 }),
      createOptionRow("Dos", { sortOrder: 2 }),
      createOptionRow("Tres", { sortOrder: 3 }),
    ];

    const moved = moveOption(rows, 1, -1);

    expect(moved.map((row) => row.label)).toEqual(["Dos", "Uno", "Tres"]);
    expect(moved.map((row) => row.sortOrder)).toEqual([1, 2, 3]);
    expect(moveOption(rows, 0, -1)).toBe(rows);
  });

  it("removes only unsaved options", () => {
    const saved = createOptionRow("Guardada", { id: "opt_1", rowKey: "opt_1" });
    const draft = createOptionRow("Nueva", { rowKey: "draft_1" });

    expect(removeNewOption([saved, draft], "draft_1").map((row) => row.label)).toEqual([
      "Guardada",
    ]);
    expect(removeNewOption([saved, draft], "opt_1").map((row) => row.label)).toEqual([
      "Guardada",
      "Nueva",
    ]);
  });

  it("removes a persisted option after the server confirms deletion", () => {
    const saved = createOptionRow("Guardada", { id: "opt_1", rowKey: "opt_1" });
    const other = createOptionRow("Otra", { id: "opt_2", rowKey: "opt_2", sortOrder: 2 });

    expect(removePersistedOption([saved, other], "opt_1")).toMatchObject([
      { id: "opt_2", label: "Otra", sortOrder: 1 },
    ]);
  });

  it("toggles active state for existing options", () => {
    const rows = [createOptionRow("Activo", { rowKey: "opt_1", isActive: true })];

    expect(toggleOptionActive(rows, "opt_1")[0].isActive).toBe(false);
  });

  it("filters by label or internal value without changing row order", () => {
    const rows = [
      createOptionRow("Pendiente", { value: "pending" }),
      createOptionRow("Aprobado", { value: "approved" }),
      createOptionRow("Rechazado", { value: "rejected" }),
    ];

    expect(filterOptionRows(rows, "app").map((row) => row.label)).toEqual(["Aprobado"]);
    expect(filterOptionRows(rows, "rech").map((row) => row.label)).toEqual([
      "Rechazado",
    ]);
  });

  it("summarizes total, active and inactive rows", () => {
    expect(
      getOptionSummary([
        createOptionRow("Activa", { isActive: true }),
        createOptionRow("Inactiva", { isActive: false }),
      ]),
    ).toEqual({
      totalCount: 2,
      activeCount: 1,
      inactiveCount: 1,
    });
  });

  it("detects duplicate labels and values case-insensitively", () => {
    const duplicateLabels = getDuplicateOptionErrors([
      createOptionRow("Activo", { rowKey: "a", value: "activo" }),
      createOptionRow(" activo ", { rowKey: "b", value: "activo_2" }),
    ]);
    const duplicateValues = getDuplicateOptionErrors([
      createOptionRow("Activo", { rowKey: "a", value: "activo" }),
      createOptionRow("Habilitado", { rowKey: "b", value: "ACTIVO" }),
    ]);

    expect(duplicateLabels).toMatchObject({
      a: "Ya existe una opción con esta etiqueta.",
      b: "Ya existe una opción con esta etiqueta.",
    });
    expect(duplicateValues).toMatchObject({
      a: "Ya existe una opción con este valor interno.",
      b: "Ya existe una opción con este valor interno.",
    });
  });

  it("preserves saved option metadata for form payloads", () => {
    expect(
      initialOptionRows([
        {
          id: "opt_1",
          label: "Activo",
          value: "activo",
          sortOrder: 2,
          isActive: false,
          hasValues: true,
          usageCount: 12,
        },
      ])[0],
    ).toMatchObject({
      id: "opt_1",
      rowKey: "opt_1",
      label: "Activo",
      value: "activo",
      sortOrder: 2,
      isActive: false,
      hasValues: true,
      usageCount: 12,
      valueTouched: true,
      editing: false,
    });
  });
});
