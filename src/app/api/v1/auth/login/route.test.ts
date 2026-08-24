import bcrypt from "bcrypt";
import { jwtVerify } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getApiAuthSecret } from "@/lib/api-auth";
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
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

const apiRefreshTokenCreate = vi.mocked(prisma.apiRefreshToken.create);
const externalAppFindUnique = vi.mocked(prisma.externalApp.findUnique);
const membershipFindMany = vi.mocked(prisma.membership.findMany);
const userFindUnique = vi.mocked(prisma.user.findUnique);

function loginRequest(body: unknown, headers?: HeadersInit) {
  return new Request("http://localhost/api/v1/auth/login", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.API_AUTH_SECRET = "test-api-auth-secret";
  membershipFindMany.mockResolvedValue([
    { organization: { active: true }, organizationId: "org_1" },
  ] as never);
  apiRefreshTokenCreate.mockResolvedValue({ id: "refresh_1" } as never);
  externalAppFindUnique.mockResolvedValue({
    active: true,
    clientId: "opco_app_client_1",
    id: "app_1",
    name: "Bodega",
    organizationId: "org_1",
    slug: "bodega",
  } as never);
});

describe("POST /api/v1/auth/login", () => {
  it("returns a one-hour bearer token and HttpOnly refresh cookie for web credentials", async () => {
    userFindUnique.mockResolvedValueOnce({
      email: "user@example.com",
      id: "user_1",
      name: "User One",
      passwordHash: await bcrypt.hash("secret123", 12),
    } as never);

    const response = await POST(loginRequest({
      clientId: "opco_app_client_1",
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
    expect(body.ok).toBe(true);
    expect(body.data.tokenType).toBe("Bearer");
    expect(body.data.expiresIn).toBe(3600);
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data).not.toHaveProperty("refreshToken");
    expect(response.headers.get("Set-Cookie")).toMatch(/^opco_api_refresh_token=opco_rt_/);
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(response.headers.get("Set-Cookie")).toContain("Secure");
    expect(response.headers.get("Set-Cookie")).toContain("SameSite=None");
    expect(response.headers.get("Set-Cookie")).toContain("Path=/api/v1/auth");
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=2592000");
    expect(apiRefreshTokenCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        expiresAt: expect.any(Date),
        externalAppId: "app_1",
        familyId: expect.any(String),
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        userId: "user_1",
      }),
      select: { id: true },
    }));
    expect(apiRefreshTokenCreate.mock.calls[0]?.[0]?.data.tokenHash).not.toContain("opco_rt_");
    expect(userFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: "user@example.com" },
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
    expect(verified.payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("returns the refresh token in JSON for native credentials without setting a cookie", async () => {
    userFindUnique.mockResolvedValueOnce({
      email: "user@example.com",
      id: "user_1",
      name: "User One",
      passwordHash: await bcrypt.hash("secret123", 12),
    } as never);

    const response = await POST(loginRequest({
      clientId: "opco_app_client_1",
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

  it("returns 401 without revealing whether the email exists", async () => {
    userFindUnique.mockResolvedValueOnce(null);

    const response = await POST(loginRequest({
      email: "missing@example.com",
      clientId: "opco_app_client_1",
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

  it("returns 503 when credential validation cannot reach the database", async () => {
    const connectionError = Object.assign(
      new Error("Server has closed the connection"),
      { code: "P1017", name: "PrismaClientKnownRequestError" },
    );
    userFindUnique.mockRejectedValue(connectionError);

    const response = await POST(loginRequest({
      email: "user@example.com",
      clientId: "opco_app_client_1",
      password: "secret123",
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "DB_UNAVAILABLE",
        message: "Servicio temporalmente no disponible.",
      },
    });
    expect(apiRefreshTokenCreate).not.toHaveBeenCalled();
  });

  it("returns 401 for an invalid password", async () => {
    userFindUnique.mockResolvedValueOnce({
      email: "user@example.com",
      id: "user_1",
      name: null,
      passwordHash: await bcrypt.hash("secret123", 12),
    } as never);

    const response = await POST(loginRequest({
      email: "user@example.com",
      clientId: "opco_app_client_1",
      password: "wrong-password",
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

  it("returns 400 for an invalid body", async () => {
    const response = await POST(loginRequest({
      email: "not-an-email",
      clientId: "",
      password: "",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "INVALID_LOGIN_BODY",
        message: "Credenciales invalidas",
      },
    });
  });

  it("fails clearly when API_AUTH_SECRET is missing", async () => {
    delete process.env.API_AUTH_SECRET;
    userFindUnique.mockResolvedValueOnce({
      email: "user@example.com",
      id: "user_1",
      name: "User One",
      passwordHash: await bcrypt.hash("secret123", 12),
    } as never);

    const response = await POST(loginRequest({
      email: "user@example.com",
      clientId: "opco_app_client_1",
      password: "secret123",
    }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "API_AUTH_SECRET_MISSING",
        message: "Autenticacion API no configurada",
      },
    });
  });

  it("requires clientId in the breaking v1 login request", async () => {
    const response = await POST(loginRequest({
      email: "user@example.com",
      password: "secret123",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "INVALID_LOGIN_BODY",
        message: "Credenciales invalidas",
      },
    });
  });

  it("returns 401 for an unknown or cross-tenant clientId without revealing app ownership", async () => {
    userFindUnique.mockResolvedValueOnce({
      email: "user@example.com",
      id: "user_1",
      name: "User One",
      passwordHash: await bcrypt.hash("secret123", 12),
    } as never);
    externalAppFindUnique.mockResolvedValueOnce(null);

    const missing = await POST(loginRequest({
      clientId: "opco_app_missing",
      email: "user@example.com",
      password: "secret123",
    }));

    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({
      ok: false,
      error: {
        code: "INVALID_CLIENT",
        message: "Aplicacion no valida",
      },
    });

    userFindUnique.mockResolvedValueOnce({
      email: "user@example.com",
      id: "user_1",
      name: "User One",
      passwordHash: await bcrypt.hash("secret123", 12),
    } as never);
    externalAppFindUnique.mockResolvedValueOnce({
      active: true,
      clientId: "opco_app_foreign",
      id: "app_foreign",
      name: "Foreign",
      organizationId: "org_foreign",
      slug: "foreign",
    } as never);

    const foreign = await POST(loginRequest({
      clientId: "opco_app_foreign",
      email: "user@example.com",
      password: "secret123",
    }));

    expect(foreign.status).toBe(401);
    expect(await foreign.json()).toEqual({
      ok: false,
      error: {
        code: "INVALID_CLIENT",
        message: "Aplicacion no valida",
      },
    });
  }, 20000);

  it("returns 401 for an inactive user without revealing account state", async () => {
    userFindUnique.mockResolvedValueOnce({
      active: false,
      email: "user@example.com",
      id: "user_1",
      name: "User One",
      passwordHash: await bcrypt.hash("secret123", 12),
    } as never);

    const response = await POST(loginRequest({
      clientId: "opco_app_client_1",
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

  it("returns 403 for an inactive app", async () => {
    userFindUnique.mockResolvedValueOnce({
      email: "user@example.com",
      id: "user_1",
      name: "User One",
      passwordHash: await bcrypt.hash("secret123", 12),
    } as never);
    externalAppFindUnique.mockResolvedValueOnce({
      active: false,
      clientId: "opco_app_client_1",
      id: "app_1",
      name: "Bodega",
      organizationId: "org_1",
      slug: "bodega",
    } as never);

    const response = await POST(loginRequest({
      clientId: "opco_app_client_1",
      email: "user@example.com",
      password: "secret123",
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "CLIENT_INACTIVE",
        message: "Aplicacion inactiva",
      },
    });
  });

  it("returns 403 for an inactive organization", async () => {
    userFindUnique.mockResolvedValueOnce({
      active: true,
      email: "user@example.com",
      id: "user_1",
      name: "User One",
      passwordHash: await bcrypt.hash("secret123", 12),
    } as never);
    membershipFindMany.mockResolvedValueOnce([
      { organization: { active: false }, organizationId: "org_1" },
    ] as never);

    const response = await POST(loginRequest({
      clientId: "opco_app_client_1",
      email: "user@example.com",
      password: "secret123",
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "TOKEN_ORGANIZATION_INACTIVE",
        message: "Organizacion inactiva",
      },
    });
    expect(externalAppFindUnique).not.toHaveBeenCalled();
  });

  it("rejects login for users with multiple organizations", async () => {
    userFindUnique.mockResolvedValueOnce({
      email: "user@example.com",
      id: "user_1",
      name: "User One",
      passwordHash: await bcrypt.hash("secret123", 12),
    } as never);
    membershipFindMany.mockResolvedValueOnce([
      { organizationId: "org_1" },
      { organizationId: "org_2" },
    ] as never);

    const response = await POST(loginRequest({
      clientId: "opco_app_client_1",
      email: "user@example.com",
      password: "secret123",
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "MULTIPLE_ORGANIZATIONS_NOT_SUPPORTED",
        message: "El usuario pertenece a multiples organizaciones",
      },
    });
  });
});
