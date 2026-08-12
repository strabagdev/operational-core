import { decode, encode, getToken } from "@auth/core/jwt";
import { describe, expect, it } from "vitest";

import { getAuthCookieOptions } from "./auth-cookies";

describe("auth session token compatibility", () => {
  it("keeps a login session decodable after a simulated restart with the same secret", async () => {
    const secret = "stable-test-secret-with-enough-entropy";
    const cookieName = getAuthCookieOptions({ NODE_ENV: "development" }).sessionToken.name;
    const token = await encode({
      salt: cookieName,
      secret,
      token: {
        email: "admin@operational-core.local",
        id: "user_1",
        name: "Administrator",
      },
    });

    const beforeRestart = await decode({ salt: cookieName, secret, token });
    const afterRestart = await decode({ salt: cookieName, secret, token });

    expect(beforeRestart).toMatchObject({
      email: "admin@operational-core.local",
      id: "user_1",
    });
    expect(afterRestart).toMatchObject({
      email: "admin@operational-core.local",
      id: "user_1",
    });
  });

  it("ignores invalid legacy authjs session cookies when looking for Operational Core sessions", async () => {
    const cookieName = getAuthCookieOptions({ NODE_ENV: "development" }).sessionToken.name;
    const token = await getToken({
      cookieName,
      req: {
        headers: new Headers({
          cookie: "authjs.session-token=invalid.legacy.cookie; __Secure-authjs.session-token=invalid",
        }),
      },
      secret: "stable-test-secret-with-enough-entropy",
    });

    expect(token).toBeNull();
  });
});
