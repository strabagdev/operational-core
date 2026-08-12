import { describe, expect, it } from "vitest";

import {
  authCookieDeletionOptions,
  authCookieDeletionHeader,
  authCookieNamesToClear,
  clearOperationalCoreAuthCookies,
  getAuthCookieOptions,
  isSecureAuthCookieEnvironment,
  isSessionChunkCookieName,
  legacyAuthJsAuthCookieNames,
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

    expect(calls.map((call) => call.name)).toEqual(authCookieNamesToClear);
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

  it("also clears legacy Auth.js cookie names without using them for new sessions", () => {
    expect(legacyAuthJsAuthCookieNames).toEqual([
      "authjs.session-token",
      "__Secure-authjs.session-token",
      "authjs.callback-url",
      "__Secure-authjs.callback-url",
      "authjs.csrf-token",
      "__Host-authjs.csrf-token",
    ]);
    expect(authCookieNamesToClear).toEqual([
      ...operationalCoreAuthCookieNames,
      ...legacyAuthJsAuthCookieNames,
    ]);
    expect(getAuthCookieOptions({ NODE_ENV: "development" }).sessionToken.name).toBe(
      "operational-core.session-token",
    );
  });

  it("detects stale session chunk cookies that Auth.js would concatenate into the session token", () => {
    expect(isSessionChunkCookieName("operational-core.session-token.0")).toBe(true);
    expect(isSessionChunkCookieName("__Secure-operational-core.session-token.1")).toBe(true);
    expect(isSessionChunkCookieName("authjs.session-token.0")).toBe(true);
    expect(isSessionChunkCookieName("operational-core.session-token")).toBe(false);
    expect(isSessionChunkCookieName("operational-core.csrf-token.0")).toBe(false);
  });

  it("can expire stale chunks on both root and app paths", () => {
    expect(authCookieDeletionOptions("operational-core.session-token.0", "/app")).toMatchObject({
      maxAge: 0,
      path: "/app",
      secure: false,
    });
    expect(authCookieDeletionHeader("operational-core.session-token.0", "/")).toContain(
      "Path=/",
    );
    expect(authCookieDeletionHeader("operational-core.session-token.0", "/app")).toContain(
      "Path=/app",
    );
  });
});
