import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRefreshTokenCookieName, hashApiRefreshToken } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiRefreshToken: {
      updateMany: vi.fn(),
    },
  },
}));

const apiRefreshTokenUpdateMany = vi.mocked(prisma.apiRefreshToken.updateMany);
const refreshToken = "opco_rt_existing_refresh_token";
const allowedOrigin = "https://client.opco.cl";

function logoutRequest({
  body,
  cookieToken = refreshToken,
  native = false,
  origin = allowedOrigin,
}: {
  body?: unknown;
  cookieToken?: string | null;
  native?: boolean;
  origin?: string;
} = {}) {
  const headers = new Headers();

  if (origin) headers.set("Origin", origin);
  if (native) headers.set("X-Opco-Client-Platform", "native");
  if (cookieToken) headers.set("Cookie", `${apiRefreshTokenCookieName}=${encodeURIComponent(cookieToken)}`);
  if (body !== undefined) headers.set("Content-Type", "application/json");

  return new Request("http://localhost/api/v1/auth/logout", {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.API_AUTH_SECRET = "test-api-auth-secret";
  process.env.API_ALLOWED_ORIGINS = allowedOrigin;
  apiRefreshTokenUpdateMany.mockResolvedValue({ count: 1 } as never);
});

describe("POST /api/v1/auth/logout", () => {
  it("revokes the current web refresh token and clears the cookie", async () => {
    const response = await POST(logoutRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: { revoked: true },
    });
    expect(apiRefreshTokenUpdateMany).toHaveBeenCalledWith({
      data: {
        revokedAt: expect.any(Date),
      },
      where: {
        revokedAt: null,
        tokenHash: hashApiRefreshToken(refreshToken),
      },
    });
    expect(response.headers.get("Set-Cookie")).toContain("opco_api_refresh_token=");
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(response.headers.get("Set-Cookie")).toContain("SameSite=None");
  });

  it("is idempotent when no native refresh token is provided", async () => {
    const response = await POST(logoutRequest({
      body: {},
      cookieToken: null,
      native: true,
      origin: "",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: { revoked: true },
    });
    expect(apiRefreshTokenUpdateMany).not.toHaveBeenCalled();
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("revokes a native body refresh token without using cookies", async () => {
    const response = await POST(logoutRequest({
      body: { refreshToken },
      cookieToken: null,
      native: true,
      origin: "",
    }));

    expect(response.status).toBe(200);
    expect(apiRefreshTokenUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tokenHash: hashApiRefreshToken(refreshToken),
      }),
    }));
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("rejects web cookie logout from an unauthorized origin", async () => {
    const response = await POST(logoutRequest({ origin: "https://evil.example" }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "REFRESH_ORIGIN_INVALID",
        message: "Origin no autorizado",
      },
    });
    expect(apiRefreshTokenUpdateMany).not.toHaveBeenCalled();
  });
});
