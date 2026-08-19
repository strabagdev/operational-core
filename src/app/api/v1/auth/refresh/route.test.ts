import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  apiRefreshTokenCookieName,
  apiRefreshTokenCookieHeader,
  hashApiRefreshToken,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    apiRefreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    membership: {
      findMany: vi.fn(),
    },
  },
}));

const apiRefreshTokenCreate = vi.mocked(prisma.apiRefreshToken.create);
const apiRefreshTokenFindUnique = vi.mocked(prisma.apiRefreshToken.findUnique);
const apiRefreshTokenUpdate = vi.mocked(prisma.apiRefreshToken.update);
const apiRefreshTokenUpdateMany = vi.mocked(prisma.apiRefreshToken.updateMany);
const membershipFindMany = vi.mocked(prisma.membership.findMany);
const transaction = vi.mocked(prisma.$transaction);

const refreshToken = "opco_rt_existing_refresh_token";
const allowedOrigin = "https://client.opco.cl";
const activeUser = {
  active: true,
  createdAt: new Date("2026-01-01"),
  email: "user@example.com",
  emailVerified: null,
  id: "user_1",
  image: null,
  name: "User One",
  passwordHash: "hash",
  updatedAt: new Date("2026-01-01"),
};
const activeExternalApp = {
  active: true,
  clientId: "opco_app_client_1",
  createdAt: new Date("2026-01-01"),
  id: "app_1",
  name: "Bodega",
  organizationId: "org_1",
  slug: "bodega",
  updatedAt: new Date("2026-01-01"),
};

function refreshRequest({
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

  return new Request("http://localhost/api/v1/auth/refresh", {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
    method: "POST",
  });
}

function storedRefreshToken(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date("2026-01-01"),
    expiresAt: new Date(Date.now() + 60_000),
    externalApp: activeExternalApp,
    externalAppId: "app_1",
    familyId: "family_1",
    id: "refresh_1",
    lastUsedAt: null,
    replacedByTokenId: null,
    revokedAt: null,
    tokenHash: hashApiRefreshToken(refreshToken),
    user: activeUser,
    userId: "user_1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.API_AUTH_SECRET = "test-api-auth-secret";
  process.env.API_ALLOWED_ORIGINS = allowedOrigin;
  membershipFindMany.mockResolvedValue([{ organizationId: "org_1" }] as never);
  apiRefreshTokenCreate.mockResolvedValue({ id: "refresh_2" } as never);
  apiRefreshTokenUpdate.mockResolvedValue({} as never);
  apiRefreshTokenUpdateMany.mockResolvedValue({ count: 1 } as never);
  transaction.mockImplementation(async (callback) => callback(prisma) as never);
});

describe("POST /api/v1/auth/refresh", () => {
  it("rotates a valid web refresh token and returns only an access token in JSON", async () => {
    apiRefreshTokenFindUnique.mockResolvedValueOnce(storedRefreshToken() as never);

    const response = await POST(refreshRequest());
    const body = await response.json() as {
      data: {
        accessToken: string;
        refreshToken?: string;
        expiresIn: number;
        tokenType: string;
      };
    };

    expect(response.status).toBe(200);
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data.expiresIn).toBe(3600);
    expect(body.data.tokenType).toBe("Bearer");
    expect(body.data.refreshToken).toBeUndefined();
    expect(response.headers.get("Set-Cookie")).toMatch(/^opco_api_refresh_token=opco_rt_/);
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(apiRefreshTokenCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        familyId: "family_1",
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    }));
    expect(apiRefreshTokenUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        replacedByTokenId: "refresh_2",
      }),
      where: { id: "refresh_1" },
    }));
    expect(apiRefreshTokenUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        revokedAt: expect.any(Date),
      }),
      where: {
        id: "refresh_1",
        replacedByTokenId: null,
        revokedAt: null,
      },
    }));
  });

  it("accepts native refresh tokens in JSON and does not depend on cookies", async () => {
    apiRefreshTokenFindUnique.mockResolvedValueOnce(storedRefreshToken() as never);

    const response = await POST(refreshRequest({
      body: { refreshToken },
      cookieToken: null,
      native: true,
      origin: "",
    }));
    const body = await response.json() as {
      data: {
        refreshToken: string;
      };
    };

    expect(response.status).toBe(200);
    expect(body.data.refreshToken).toMatch(/^opco_rt_/);
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("revokes the token family when a previously rotated token is reused", async () => {
    apiRefreshTokenFindUnique.mockResolvedValueOnce(storedRefreshToken({
      replacedByTokenId: "refresh_2",
      revokedAt: new Date(),
    }) as never);

    const response = await POST(refreshRequest());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "REFRESH_TOKEN_REUSED",
        message: "Refresh token no valido",
      },
    });
    expect(apiRefreshTokenUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        familyId: "family_1",
        revokedAt: null,
      },
    }));
  });

  it.each([
    ["expired", { expiresAt: new Date(Date.now() - 60_000) }, "REFRESH_TOKEN_EXPIRED"],
    ["revoked", { revokedAt: new Date() }, "REFRESH_TOKEN_REVOKED"],
    ["inactive user", { user: { ...activeUser, active: false } }, "REFRESH_USER_INACTIVE"],
    ["inactive app", { externalApp: { ...activeExternalApp, active: false } }, "REFRESH_APP_INACTIVE"],
  ])("rejects a %s refresh token", async (_, overrides, code) => {
    apiRefreshTokenFindUnique.mockResolvedValueOnce(storedRefreshToken(overrides) as never);

    const response = await POST(refreshRequest());
    const body = await response.json() as { error: { code: string } };

    expect(response.status).toBe(code === "REFRESH_APP_INACTIVE" ? 403 : 401);
    expect(body.error.code).toBe(code);
  });

  it("rejects deleted users because their cascade-deleted refresh token cannot be found", async () => {
    apiRefreshTokenFindUnique.mockResolvedValueOnce(null);

    const response = await POST(refreshRequest());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "REFRESH_TOKEN_INVALID",
        message: "Refresh token no valido",
      },
    });
  });

  it("rejects web cookie refresh from an unauthorized origin before using the token", async () => {
    const response = await POST(refreshRequest({ origin: "https://evil.example" }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "REFRESH_ORIGIN_INVALID",
        message: "Origin no autorizado",
      },
    });
    expect(apiRefreshTokenFindUnique).not.toHaveBeenCalled();
  });

  it("uses the documented cookie attributes", () => {
    expect(apiRefreshTokenCookieHeader("opco_rt_value")).toBe(
      "opco_api_refresh_token=opco_rt_value; HttpOnly; Secure; SameSite=None; Path=/api/v1/auth; Max-Age=2592000",
    );
  });
});
