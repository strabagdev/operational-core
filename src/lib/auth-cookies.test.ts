import { describe, expect, it } from "vitest";

import {
  authCookieDeletionOptions,
  clearOperationalCoreAuthCookies,
  getAuthCookieOptions,
  isSecureAuthCookieEnvironment,
  operationalCoreAuthCookieNames,
  operationalCoreCallbackCookieNames,
  operationalCoreCsrfCookieNames,
  operationalCoreSessionCookieNames,
} from "./auth-cookies";

describe("auth cookie names", () => {
  it("uses local Operational Core cookie names outside secure mode", () => {
    const options = getAuthCookieOptions({
      AUTH_URL: "",
      NODE_ENV: "development",
    });

    expect(options.sessionToken.name).toBe("operational-core.session-token");
    expect(options.callbackUrl.name).toBe("operational-core.callback-url");
    expect(options.csrfToken.name).toBe("operational-core.csrf-token");
  });

  it("uses secure Operational Core cookie names for HTTPS production", () => {
    const options = getAuthCookieOptions({
      AUTH_URL: "https://operational-core.example.com",
      NODE_ENV: "production",
    });

    expect(options.sessionToken.name).toBe("__Secure-operational-core.session-token");
    expect(options.callbackUrl.name).toBe("__Secure-operational-core.callback-url");
    expect(options.csrfToken.name).toBe("__Host-operational-core.csrf-token");
  });

  it("detects secure cookie mode from AUTH_URL or production", () => {
    expect(isSecureAuthCookieEnvironment({ AUTH_URL: "https://example.com" })).toBe(true);
    expect(isSecureAuthCookieEnvironment({ AUTH_URL: "http://example.com", NODE_ENV: "production" })).toBe(false);
    expect(isSecureAuthCookieEnvironment({ NODE_ENV: "production" })).toBe(true);
  });

  it("tracks every project-owned auth cookie variant for logout cleanup", () => {
    expect(operationalCoreSessionCookieNames).toEqual([
      "operational-core.session-token",
      "__Secure-operational-core.session-token",
    ]);
    expect(operationalCoreCallbackCookieNames).toEqual([
      "operational-core.callback-url",
      "__Secure-operational-core.callback-url",
    ]);
    expect(operationalCoreCsrfCookieNames).toEqual([
      "operational-core.csrf-token",
      "__Host-operational-core.csrf-token",
    ]);
    expect(operationalCoreAuthCookieNames).toEqual([
      "operational-core.session-token",
      "__Secure-operational-core.session-token",
      "operational-core.callback-url",
      "__Secure-operational-core.callback-url",
      "operational-core.csrf-token",
      "__Host-operational-core.csrf-token",
    ]);
  });

  it("deletes secure production cookies with Secure-compatible options", () => {
    expect(authCookieDeletionOptions("__Secure-operational-core.session-token")).toMatchObject({
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    expect(authCookieDeletionOptions("__Host-operational-core.csrf-token")).toMatchObject({
      maxAge: 0,
      path: "/",
      secure: true,
    });
    expect(authCookieDeletionOptions("operational-core.session-token")).toMatchObject({
      maxAge: 0,
      path: "/",
      secure: false,
    });
  });

  it("logout cleanup expires both local and production cookie variants", () => {
    const calls: Array<{ name: string; options: { maxAge?: number; secure?: boolean }; value: string }> = [];

    clearOperationalCoreAuthCookies({
      set(name, value, options) {
        calls.push({ name, value, options });
      },
    });

    expect(calls.map((call) => call.name)).toEqual(operationalCoreAuthCookieNames);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "__Secure-operational-core.session-token",
          value: "",
          options: expect.objectContaining({ maxAge: 0, secure: true }),
        }),
        expect.objectContaining({
          name: "operational-core.session-token",
          value: "",
          options: expect.objectContaining({ maxAge: 0, secure: false }),
        }),
      ]),
    );
  });
});
