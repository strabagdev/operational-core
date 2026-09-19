import { encode } from "@auth/core/jwt";
import { describe, expect, it, vi } from "vitest";

import {
  inspectSessionCookie,
  sessionCookieNamesToClear,
} from "./auth-session-recovery";

const cookieName = "operational-core.session-token";
const secret = "current-local-secret-with-enough-entropy";

describe("invalid local session recovery", () => {
  it("keeps a valid session", async () => {
    const token = await sessionToken(secret);

    await expect(inspectSessionCookie({
      cookieHeader: `${cookieName}=${token}; unrelated=value`,
      cookieName,
      secret,
    })).resolves.toMatchObject({ kind: "valid", token: { id: "user_1" } });
  });

  it("treats a corrupt session cookie as invalid", async () => {
    await expect(inspectSessionCookie({
      cookieHeader: `${cookieName}=not-a-jwe`,
      cookieName,
      secret,
    })).resolves.toEqual({ kind: "invalid" });
  });

  it("treats a cookie issued with another secret as invalid", async () => {
    const token = await sessionToken("previous-local-secret-with-enough-entropy");

    await expect(inspectSessionCookie({
      cookieHeader: `${cookieName}=${token}`,
      cookieName,
      secret,
    })).resolves.toEqual({ kind: "invalid" });
  });

  it("treats an expired session as invalid", async () => {
    const token = await sessionToken(secret, -60);

    await expect(inspectSessionCookie({
      cookieHeader: `${cookieName}=${token}`,
      cookieName,
      secret,
    })).resolves.toEqual({ kind: "invalid" });
  });

  it("reassembles valid Auth.js cookie fragments", async () => {
    const token = await sessionToken(secret);
    const middle = Math.floor(token.length / 2);

    await expect(inspectSessionCookie({
      cookieHeader: `${cookieName}.0=${token.slice(0, middle)}; ${cookieName}.1=${token.slice(middle)}`,
      cookieName,
      secret,
    })).resolves.toMatchObject({ kind: "valid" });
  });

  it("clears only application session cookies and their fragments", () => {
    expect(sessionCookieNamesToClear([
      cookieName,
      `${cookieName}.0`,
      "__Secure-operational-core.session-token.1",
      "operational-core.callback-url",
      "operational-core.csrf-token",
      "authjs.session-token",
      "unrelated",
    ])).toEqual([
      cookieName,
      `${cookieName}.0`,
      "__Secure-operational-core.session-token.1",
    ]);
  });

  it("allows login after recovery because no session cookie remains", async () => {
    await expect(inspectSessionCookie({
      cookieHeader: "unrelated=value",
      cookieName,
      secret,
    })).resolves.toEqual({ kind: "none" });
  });

  it("propagates unexpected decoder failures", async () => {
    const unexpected = new Error("unexpected callback failure");
    const decodeToken = vi.fn().mockRejectedValue(unexpected);

    await expect(inspectSessionCookie({
      cookieHeader: `${cookieName}=synthetic-token`,
      cookieName,
      decodeToken,
      secret,
    })).rejects.toBe(unexpected);
  });
});

async function sessionToken(tokenSecret: string, maxAge = 60 * 60) {
  return encode({
    maxAge,
    salt: cookieName,
    secret: tokenSecret,
    token: { email: "admin@operational-core.local", id: "user_1" },
  });
}
