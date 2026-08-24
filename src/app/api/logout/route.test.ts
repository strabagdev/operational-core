import { describe, expect, it } from "vitest";

import { POST } from "./route";

describe("POST /api/logout", () => {
  it("redirects to same-origin login with a relative Location", async () => {
    const response = await POST();

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
  });

  it("does not emit localhost in production-style logout redirects", async () => {
    const response = await POST();

    expect(response.headers.get("location")).not.toContain("localhost");
  });

  it("ignores invalid callbackUrl inputs and expires auth cookies", async () => {
    const response = await POST();
    const cookieHeader = response.headers.get("set-cookie") ?? "";

    expect(response.headers.get("location")).toBe("/login");
    expect(response.headers.get("location")).not.toContain("evil.example");
    expect(cookieHeader).toContain("operational-core.session-token=;");
    expect(cookieHeader).toContain("__Secure-operational-core.session-token=;");
    expect(cookieHeader).toContain("authjs.session-token=;");
    expect(cookieHeader).toContain("__Secure-authjs.session-token=;");
    expect(cookieHeader).toContain("Max-Age=0");
  });

  it("keeps local logout relative to the current development origin", async () => {
    const response = await POST();

    expect(response.headers.get("location")).toBe("/login");
  });
});
