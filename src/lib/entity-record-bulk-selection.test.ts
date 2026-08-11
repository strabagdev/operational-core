import { describe, expect, it } from "vitest";

import {
  getBulkSelectionState,
  selectionScopeSignature,
  toggleAllVisibleSelection,
  toggleRecordSelection,
} from "./entity-record-bulk-selection";

describe("entity record bulk selection", () => {
  it("selects and unselects one record", () => {
    expect(toggleRecordSelection([], "record_1")).toEqual(["record_1"]);
    expect(toggleRecordSelection(["record_1"], "record_1")).toEqual([]);
  });

  it("selects several records", () => {
    expect(toggleRecordSelection(["record_1"], "record_2")).toEqual([
      "record_1",
      "record_2",
    ]);
  });

  it("selects all visible records and clears them when all are selected", () => {
    expect(toggleAllVisibleSelection([], ["record_1", "record_2"])).toEqual([
      "record_1",
      "record_2",
    ]);
    expect(toggleAllVisibleSelection(["record_1", "record_2"], ["record_1", "record_2"])).toEqual([]);
  });

  it("reports indeterminate header state", () => {
    expect(getBulkSelectionState(["record_1"], ["record_1", "record_2"])).toMatchObject({
      allSelected: false,
      indeterminate: true,
      selectedCount: 1,
    });
  });

  it("ignores selected records that are no longer visible", () => {
    expect(getBulkSelectionState(["record_hidden"], ["record_1"])).toMatchObject({
      allSelected: false,
      indeterminate: false,
      selectedCount: 0,
      visibleSelectedIds: [],
    });
  });

  it("changes scope signature when filters or visible records change", () => {
    expect(
      selectionScopeSignature({
        entityTypeId: "entity_1",
        query: "ana",
        visibleIds: ["record_1"],
      }),
    ).not.toBe(
      selectionScopeSignature({
        entityTypeId: "entity_1",
        query: "luis",
        visibleIds: ["record_1"],
      }),
    );
  });
});
