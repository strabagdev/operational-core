import { describe, expect, it } from "vitest";

import { parseContractAdministrationStatus } from "./contract-status";

describe("contract administration status", () => {
  it("keeps all supported filters including ALL", () => {
    expect(parseContractAdministrationStatus("ACTIVE")).toBe("ACTIVE");
    expect(parseContractAdministrationStatus("INACTIVE")).toBe("INACTIVE");
    expect(parseContractAdministrationStatus("ARCHIVED")).toBe("ARCHIVED");
    expect(parseContractAdministrationStatus("ALL")).toBe("ALL");
  });

  it("defaults unknown filters to ACTIVE", () => {
    expect(parseContractAdministrationStatus()).toBe("ACTIVE");
    expect(parseContractAdministrationStatus("DELETED")).toBe("ACTIVE");
  });
});
