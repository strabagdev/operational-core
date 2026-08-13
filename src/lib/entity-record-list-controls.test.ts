import { describe, expect, it } from "vitest";

import { buildRecordListHref } from "./entity-record-list-controls";

describe("entity record list controls", () => {
  const basePath = "/app/contracts/contract_1/records/entity_1";

  it("updates q, resets page, and preserves pageSize, sort, and direction", () => {
    expect(buildRecordListHref({
      basePath,
      query: "martinez",
      searchParams: {
        dir: "desc",
        page: "4",
        pageSize: "50",
        q: "mar",
        sort: "displayName",
      },
    })).toBe(
      "/app/contracts/contract_1/records/entity_1?dir=desc&pageSize=50&q=martinez&sort=displayName",
    );
  });

  it("removes q when the search is cleared", () => {
    expect(buildRecordListHref({
      basePath,
      query: "",
      searchParams: {
        dir: "asc",
        page: "2",
        pageSize: "25",
        q: "martinez",
        sort: "updatedAt",
      },
    })).toBe(
      "/app/contracts/contract_1/records/entity_1?dir=asc&pageSize=25&sort=updatedAt",
    );
  });

  it("changes pageSize, resets page, and keeps current q and sorting", () => {
    expect(buildRecordListHref({
      basePath,
      pageSize: "100",
      query: "martinez",
      searchParams: {
        dir: "desc",
        page: "3",
        pageSize: "25",
        q: "martinez",
        sort: "field:amount",
      },
    })).toBe(
      "/app/contracts/contract_1/records/entity_1?dir=desc&pageSize=100&q=martinez&sort=field%3Aamount",
    );
  });
});
