import bcrypt from "bcrypt";
import { jwtVerify, SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  apiLoginSelectionChallengeCookieName,
  apiLoginSelectionChallengeType,
  getApiAuthSecret,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $disconnect: vi.fn(),
    apiRefreshToken: {
      create: vi.fn(),
    },
    externalApp: {
      findUnique: vi.fn(),
    },
    membership: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

const apiRefreshTokenCreate = vi.mocked(prisma.apiRefreshToken.create);
const externalAppFindUnique = vi.mocked(prisma.externalApp.findUnique);
const membershipFindMany = vi.mocked(prisma.membership.findMany);
const membershipFindUnique = vi.mocked(prisma.membership.findUnique);
const userFindUnique = vi.mocked(prisma.user.findUnique);
const allowedOrigin = "https://client.opco.cl";

function loginRequest(body: unknown, headers?: HeadersInit) {
  return new Request("http://localhost/api/v1/auth/login", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  });
}

function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    email: "user@example.com",
    id: "user_1",
    name: "User One",
    passwordHash: "",
    ...overrides,
  };
}

function activeApp(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    clientId: "opco_app_client_1",
    id: "app_1",
    name: "Bodega",
    organizationId: "org_1",
    slug: "bodega",
    ...overrides,
  };
}

function membershipOrganization({
  apps,
  id,
  name,
}: {
  apps: ReturnType<typeof activeApp>[];
  id: string;
  name: string;
}) {
  return {
    organization: {
      active: true,
      externalApps: apps,
      id,
      name,
    },
  };
}

async function mockValidUser() {
  userFindUnique.mockResolvedValueOnce(activeUser({
    passwordHash: await bcrypt.hash("secret123", 12),
  }) as never);
}

async function signSelectionChallenge({
  expiresIn = "5m",
  nonce = "nonce_1",
  options = [{
    appId: "app_1",
    appName: "Bodega",
    appSlug: "bodega",
    clientId: "opco_app_client_1",
    organizationId: "org_1",
    organizationName: "Empresa A",
    selectionId: "selection_1",
  }],
  userId = "user_1",
}: {
  expiresIn?: string;
  nonce?: string;
  options?: unknown[];
  userId?: string;
} = {}) {
  return new SignJWT({
    nonce,
    options,
    type: apiLoginSelectionChallengeType,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getApiAuthSecret());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  process.env.API_AUTH_SECRET = "test-api-auth-secret";
  process.env.API_ALLOWED_ORIGINS = allowedOrigin;
  apiRefreshTokenCreate.mockResolvedValue({ id: "refresh_1" } as never);
  externalAppFindUnique.mockResolvedValue(activeApp() as never);
  membershipFindMany.mockResolvedValue([
    membershipOrganization({
      apps: [activeApp()],
      id: "org_1",
      name: "Empresa A",
    }),
  ] as never);
  membershipFindUnique.mockResolvedValue({
    organization: { active: true },
    role: "MEMBER",
  } as never);
});

describe("POST /api/v1/auth/login", () => {
  it("logs a single-organization user in directly from neutral credentials", async () => {
    await mockValidUser();

    const response = await POST(loginRequest({
      email: "  USER@example.com ",
      password: "secret123",
    }));
    const body = await response.json() as {
      data: {
        accessToken: string;
        expiresIn: number;
        tokenType: string;
      };
      ok: true;
    };

    expect(response.status).toBe(200);
    expect(body.data.tokenType).toBe("Bearer");
    expect(body.data.expiresIn).toBe(3600);
    expect(response.headers.get("Set-Cookie")).toMatch(/^opco_api_refresh_token=opco_rt_/);
    expect(apiRefreshTokenCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        externalAppId: "app_1",
        userId: "user_1",
      }),
    }));
    expect(membershipFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user_1" },
    }));

    const verified = await jwtVerify(body.data.accessToken, getApiAuthSecret(), {
      algorithms: ["HS256"],
      typ: "JWT",
    });

    expect(verified.payload).toMatchObject({
      appId: "app_1",
      clientId: "opco_app_client_1",
      email: "user@example.com",
      sub: "user_1",
      type: "access",
    });
  });

  it("returns only the authenticated user's eligible organizations when selection is required", async () => {
    await mockValidUser();
    membershipFindMany.mockResolvedValueOnce([
      membershipOrganization({
        apps: [activeApp()],
        id: "org_1",
        name: "Empresa A",
      }),
      membershipOrganization({
        apps: [activeApp({
          clientId: "opco_app_client_2",
          id: "app_2",
          name: "Bodega B",
          organizationId: "org_2",
          slug: "bodega-b",
        })],
        id: "org_2",
        name: "Empresa B",
      }),
    ] as never);

    const response = await POST(loginRequest({
      email: "user@example.com",
      password: "secret123",
      preferredOrganizationId: "org_2",
    }));
    const body = await response.json() as {
      data: {
        challenge: string;
        organizations: { organization: { name: string }; selectionId: string }[];
        preferredSelectionId?: string;
        status: string;
      };
      ok: true;
    };

    expect(response.status).toBe(200);
    expect(body.data.status).toBe("selection_required");
    expect(body.data.organizations).toEqual([
      {
        organization: { name: "Empresa A" },
        selectionId: expect.any(String),
      },
      {
        organization: { name: "Empresa B" },
        selectionId: expect.any(String),
      },
    ]);
    expect(body.data).not.toHaveProperty("accessToken");
    expect(body.data).not.toHaveProperty("refreshToken");
    expect(body.data.preferredSelectionId).toBe(body.data.organizations[1].selectionId);
    expect(response.headers.get("Set-Cookie")).toContain(apiLoginSelectionChallengeCookieName);
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(response.headers.get("Set-Cookie")).toContain("Secure");
    expect(response.headers.get("Set-Cookie")).toContain("SameSite=None");
    expect(response.headers.get("Set-Cookie")).toContain("Path=/api/v1/auth");
    expect(JSON.stringify(body.data.organizations)).not.toContain("org_");
    expect(JSON.stringify(body.data.organizations)).not.toContain("opco_app_");
  });

  it("does not reveal organizations when credentials are invalid", async () => {
    userFindUnique.mockResolvedValueOnce(null);

    const response = await POST(loginRequest({
      email: "missing@example.com",
      password: "secret123",
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Credenciales invalidas",
      },
    });
    expect(membershipFindMany).not.toHaveBeenCalled();
    expect(apiRefreshTokenCreate).not.toHaveBeenCalled();
  });

  it("rejects neutral login when the organization has no valid external app", async () => {
    await mockValidUser();
    membershipFindMany.mockResolvedValueOnce([
      membershipOrganization({
        apps: [],
        id: "org_1",
        name: "Empresa A",
      }),
    ] as never);

    const response = await POST(loginRequest({
      email: "user@example.com",
      password: "secret123",
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Credenciales invalidas",
      },
    });
  });

  it("rejects neutral login when an organization has multiple active external apps", async () => {
    await mockValidUser();
    membershipFindMany.mockResolvedValueOnce([
      membershipOrganization({
        apps: [
          activeApp({ id: "app_1" }),
          activeApp({ clientId: "opco_app_client_2", id: "app_2" }),
        ],
        id: "org_1",
        name: "Empresa A",
      }),
    ] as never);

    const response = await POST(loginRequest({
      email: "user@example.com",
      password: "secret123",
    }));

    expect(response.status).toBe(401);
    expect(apiRefreshTokenCreate).not.toHaveBeenCalled();
  });

  it("completes selection by revalidating the selected organization and app", async () => {
    const challenge = await signSelectionChallenge();
    userFindUnique.mockResolvedValueOnce({
      active: true,
      email: "user@example.com",
      id: "user_1",
      name: "User One",
    } as never);
    externalAppFindUnique.mockResolvedValueOnce(activeApp() as never);

    const response = await POST(loginRequest({
      challenge,
      selectionId: "selection_1",
    }, {
      cookie: `${apiLoginSelectionChallengeCookieName}=nonce_1`,
      origin: allowedOrigin,
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toContain(`${apiLoginSelectionChallengeCookieName}=`);
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(apiRefreshTokenCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        externalAppId: "app_1",
        userId: "user_1",
      }),
    }));
    expect(membershipFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId_organizationId: {
          organizationId: "org_1",
          userId: "user_1",
        },
      },
    }));
  });

  it("rejects selecting an organization outside the signed challenge", async () => {
    const challenge = await signSelectionChallenge();

    const response = await POST(loginRequest({
      challenge,
      selectionId: "selection_foreign",
    }, {
      cookie: `${apiLoginSelectionChallengeCookieName}=nonce_1`,
      origin: allowedOrigin,
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "LOGIN_SELECTION_INVALID",
        message: "Credenciales invalidas",
      },
    });
    expect(apiRefreshTokenCreate).not.toHaveBeenCalled();
  });

  it("rejects altered selection challenges", async () => {
    const response = await POST(loginRequest({
      challenge: "not-a-jwt",
      selectionId: "selection_1",
    }, {
      cookie: `${apiLoginSelectionChallengeCookieName}=nonce_1`,
      origin: allowedOrigin,
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "LOGIN_SELECTION_INVALID",
        message: "Credenciales invalidas",
      },
    });
  });

  it("rejects expired selection challenges", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const challenge = await signSelectionChallenge({ expiresIn: "1s" });

    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));

    const response = await POST(loginRequest({
      challenge,
      selectionId: "selection_1",
    }, {
      cookie: `${apiLoginSelectionChallengeCookieName}=nonce_1`,
      origin: allowedOrigin,
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "LOGIN_SELECTION_EXPIRED",
        message: "Credenciales invalidas",
      },
    });
  });

  it("rejects a reused web selection challenge after the nonce cookie is gone", async () => {
    const challenge = await signSelectionChallenge();

    const response = await POST(loginRequest({
      challenge,
      selectionId: "selection_1",
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "LOGIN_SELECTION_INVALID",
        message: "Credenciales invalidas",
      },
    });
    expect(apiRefreshTokenCreate).not.toHaveBeenCalled();
  });

  it("rejects web selection from an unauthorized origin", async () => {
    const challenge = await signSelectionChallenge();

    const response = await POST(loginRequest({
      challenge,
      selectionId: "selection_1",
    }, {
      cookie: `${apiLoginSelectionChallengeCookieName}=nonce_1`,
      origin: "https://evil.example",
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "LOGIN_SELECTION_INVALID",
        message: "Credenciales invalidas",
      },
    });
    expect(apiRefreshTokenCreate).not.toHaveBeenCalled();
  });

  it("keeps the legacy clientId path working for existing first-company clients", async () => {
    await mockValidUser();

    const response = await POST(loginRequest({
      clientId: "opco_app_client_1",
      email: "user@example.com",
      password: "secret123",
    }));

    expect(response.status).toBe(200);
    expect(externalAppFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        clientId: "opco_app_client_1",
      },
    }));
  });

  it("returns the refresh token in JSON for native neutral credentials", async () => {
    await mockValidUser();

    const response = await POST(loginRequest({
      email: "user@example.com",
      password: "secret123",
    }, {
      "X-Opco-Client-Platform": "native",
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
});
