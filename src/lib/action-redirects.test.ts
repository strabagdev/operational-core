import { describe, expect, it } from "vitest";

import { safeAppRedirectPath, withActionMessage } from "./action-redirects";

describe("action redirects", () => {
  it("allows only internal app paths", () => {
    expect(safeAppRedirectPath("/app/contracts/1?fieldQ=rut", "/app")).toBe(
      "/app/contracts/1?fieldQ=rut",
    );
    expect(safeAppRedirectPath("https://evil.test/app/contracts/1", "/app")).toBe(
      "/app",
    );
    expect(safeAppRedirectPath("//evil.test/app/contracts/1", "/app")).toBe(
      "/app",
    );
    expect(safeAppRedirectPath("/login", "/app")).toBe("/app");
  });

  it("sets action messages without losing existing query params", () => {
    expect(withActionMessage("/app/contracts/1?fieldQ=rut", "notice", "Campo creado")).toBe(
      "/app/contracts/1?fieldQ=rut&notice=Campo+creado",
    );
  });
});
