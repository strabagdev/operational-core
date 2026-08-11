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

  it("keeps action error and notice messages mutually exclusive", () => {
    expect(
      withActionMessage(
        "/app/settings/contracts?status=ARCHIVED&error=Error+anterior",
        "notice",
        "Contrato archivado.",
      ),
    ).toBe(
      "/app/settings/contracts?status=ARCHIVED&notice=Contrato+archivado.",
    );

    expect(
      withActionMessage(
        "/app/settings/contracts?status=ARCHIVED&notice=Mensaje+anterior",
        "error",
        "La confirmación no coincide.",
      ),
    ).toBe(
      "/app/settings/contracts?status=ARCHIVED&error=La+confirmaci%C3%B3n+no+coincide.",
    );
  });
});
