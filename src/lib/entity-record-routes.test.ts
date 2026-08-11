import { describe, expect, it } from "vitest";

import {
  entityRecordCancelEditPath,
  entityRecordDetailPath,
  entityRecordEditPath,
} from "./entity-record-routes";

describe("entity record routes", () => {
  it("opens the display name on the read-only detail route", () => {
    expect(entityRecordDetailPath("contract_1", "entity_1", "record_1")).toBe(
      "/app/contracts/contract_1/records/entity_1/record_1",
    );
  });

  it("opens Editar directly in edit mode", () => {
    expect(entityRecordEditPath("contract_1", "entity_1", "record_1")).toBe(
      "/app/contracts/contract_1/records/entity_1/record_1?edit=1",
    );
  });

  it("cancels edit mode back to the read-only detail route", () => {
    expect(entityRecordCancelEditPath("contract_1", "entity_1", "record_1")).toBe(
      "/app/contracts/contract_1/records/entity_1/record_1",
    );
  });
});
