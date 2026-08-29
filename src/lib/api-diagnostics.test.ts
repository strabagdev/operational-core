import { describe, expect, it, vi } from "vitest";

import { applyApiDiagnosticsHeaders, createApiServerTiming } from "./api-diagnostics";

describe("API diagnostics headers", () => {
  it("echoes a sanitized client diagnostic request id and adds Server-Timing", () => {
    const request = new Request("https://opco.test/api/v1/health", {
      headers: { "X-Opco-Request-Id": "opco_diag_123" },
    });
    const response = new Response(null);

    applyApiDiagnosticsHeaders(response, request, "total;dur=10");

    expect(response.headers.get("X-Opco-Request-Id")).toBe("opco_diag_123");
    expect(response.headers.get("Server-Timing")).toBe("total;dur=10");
  });

  it("does not echo malformed diagnostic request ids", () => {
    const request = new Request("https://opco.test/api/v1/health", {
      headers: { "X-Opco-Request-Id": "bad value with spaces" },
    });
    const response = new Response(null);

    applyApiDiagnosticsHeaders(response, request);

    expect(response.headers.get("X-Opco-Request-Id")).toMatch(/^srv_/);
    expect(response.headers.get("X-Opco-Request-Id")).not.toBe("bad value with spaces");
  });

  it("serializes timing phases without raw scope identifiers", () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const timing = createApiServerTiming("state-update workflow POST timing");

    timing.setScope({ appViewId: "view_secret", contractId: "contract_secret" });
    timing.mark("auth_context");
    const header = timing.finish("ok", 200);

    expect(header).toContain("total;dur=");
    expect(header).toContain("result;desc=\"ok\"");
    expect(header).toContain("auth_context;dur=");
    expect(JSON.stringify(log.mock.calls)).not.toContain("contract_secret");
    expect(JSON.stringify(log.mock.calls)).not.toContain("view_secret");
    log.mockRestore();
  });
});
