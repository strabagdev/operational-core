import { encode } from "@auth/core/jwt";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { proxy } from "./proxy";

const cookieName = "operational-core.session-token";
const secret = "current-local-secret-with-enough-entropy";

describe("proxy session recovery", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = secret;
    process.env.AUTH_URL = "http://localhost:3000";
  });

  afterEach(() => {
    delete process.env.AUTH_SECRET;
    delete process.env.AUTH_URL;
  });

  it("allows a valid session through without clearing cookies", async () => {
    const token = await encode({
      salt: cookieName,
      secret,
      token: { id: "user_1" },
    });
    const response = await proxy(request("/app", `${cookieName}=${token}; preference=kept`));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("clears an incompatible session and preserves the protected callback", async () => {
    const token = await encode({
      salt: cookieName,
      secret: "previous-local-secret-with-enough-entropy",
      token: { id: "user_1" },
    });
    const response = await proxy(request(
      "/app/contracts/contract_1?tab=records",
      `${cookieName}=${token}; preference=kept`,
    ));
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?callbackUrl=%2Fapp%2Fcontracts%2Fcontract_1%3Ftab%3Drecords",
    );
    expect(setCookie).toContain(`${cookieName}=;`);
    expect(setCookie).not.toContain("preference=");
  });

  it("clears every received application session fragment", async () => {
    const response = await proxy(request(
      "/login",
      `${cookieName}.0=broken; ${cookieName}.1=token; unrelated=kept`,
    ));
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
    expect(setCookie).toContain(`${cookieName}.0=;`);
    expect(setCookie).toContain(`${cookieName}.1=;`);
    expect(setCookie).not.toContain("unrelated=");

    const recoveredResponse = await proxy(request("/login", "unrelated=kept"));
    expect(recoveredResponse.status).toBe(200);
    expect(recoveredResponse.headers.get("location")).toBeNull();
  });
});

function request(path: string, cookie: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { cookie },
  });
}
