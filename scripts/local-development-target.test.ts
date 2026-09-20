import { describe, expect, it } from "vitest";

import {
  assertLocalDevelopmentDatabaseEnvironment,
  assertLocalDevelopmentDatabaseUrl,
} from "./local-development-target.mjs";

describe("local development database target", () => {
  const localUrl = "postgresql://opco_dev:local-only@127.0.0.1:55432/opco_development?schema=public";

  it("accepts only the explicit loopback development target", () => {
    expect(assertLocalDevelopmentDatabaseUrl(localUrl)).toEqual({
      database: "opco_development",
      host: "127.0.0.1",
      port: "55432",
      user: "opco_dev",
    });
  });

  it.each([
    "postgresql://opco_dev:x@localhost:55432/opco_development",
    "postgresql://opco_dev:x@127.0.0.1:5432/opco_development",
    "postgresql://opco_dev:x@127.0.0.1:55432/other",
    "postgresql://other:x@127.0.0.1:55432/opco_development",
    "postgresql://opco_dev:x@db.example.com:55432/opco_development",
  ])("rejects unauthorized destination %s", (url) => {
    expect(() => assertLocalDevelopmentDatabaseUrl(url)).toThrow("not the authorized local target");
  });

  it("validates every effective database URL", () => {
    expect(() => assertLocalDevelopmentDatabaseEnvironment({
      DATABASE_URL: localUrl,
      DIRECT_URL: "postgresql://opco_dev:x@db.example.com:55432/opco_development",
    })).toThrow("DIRECT_URL is not the authorized local target");
  });
});
