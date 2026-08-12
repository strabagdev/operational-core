import { describe, expect, it } from "vitest";

import { getAuthRouteDecision, isPublicInfrastructurePath } from "./auth-route-policy";

describe("auth route policy", () => {
  it("keeps public login available without a session", () => {
    expect(getAuthRouteDecision({ hasSession: false, pathname: "/login" })).toEqual({
      kind: "next",
    });
  });

  it("keeps setup route available for its page-level initialization checks", () => {
    expect(getAuthRouteDecision({ hasSession: false, pathname: "/setup" })).toEqual({
      kind: "next",
    });
    expect(getAuthRouteDecision({ hasSession: true, pathname: "/setup" })).toEqual({
      kind: "next",
    });
  });

  it("redirects protected app routes without a session", () => {
    expect(getAuthRouteDecision({ hasSession: false, pathname: "/app" })).toEqual({
      kind: "redirect",
      destination: "/login?callbackUrl=%2Fapp",
    });
    expect(
      getAuthRouteDecision({
        hasSession: false,
        pathname: "/app/contracts/123",
        search: "?tab=records",
      }),
    ).toEqual({
      kind: "redirect",
      destination: "/login?callbackUrl=%2Fapp%2Fcontracts%2F123%3Ftab%3Drecords",
    });
  });

  it("allows protected app routes with a session", () => {
    expect(getAuthRouteDecision({ hasSession: true, pathname: "/app" })).toEqual({
      kind: "next",
    });
  });

  it("redirects authenticated login to the app once", () => {
    expect(getAuthRouteDecision({ hasSession: true, pathname: "/login" })).toEqual({
      kind: "redirect",
      destination: "/app",
    });
  });

  it("does not redirect root in the proxy policy", () => {
    expect(getAuthRouteDecision({ hasSession: false, pathname: "/" })).toEqual({
      kind: "next",
    });
    expect(getAuthRouteDecision({ hasSession: true, pathname: "/" })).toEqual({
      kind: "next",
    });
  });

  it("does not intercept auth or internal asset routes", () => {
    expect(isPublicInfrastructurePath("/api/auth/session")).toBe(true);
    expect(isPublicInfrastructurePath("/_next/static/chunk.js")).toBe(true);
    expect(isPublicInfrastructurePath("/_next/image")).toBe(true);
    expect(isPublicInfrastructurePath("/favicon.ico")).toBe(true);
  });
});
