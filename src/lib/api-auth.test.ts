import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  apiAccessTokenExpiresIn,
  apiAccessTokenType,
  apiJwtAlgorithm,
  ApiAuthConfigurationError,
  extractBearerToken,
  getApiAuthSecret,
  getAuthenticatedApiUser,
  requireApiUser,
  requireApiContractAccess,
  signApiAccessToken,
  verifyApiAccessToken,
} from "./api-auth";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $disconnect: vi.fn(),
    contract: {
      findFirst: vi.fn(),
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

const contractFindFirst = vi.mocked(prisma.contract.findFirst);
const externalAppFindUnique = vi.mocked(prisma.externalApp.findUnique);
const membershipFindMany = vi.mocked(prisma.membership.findMany);
const membershipFindUnique = vi.mocked(prisma.membership.findUnique);
const userFindUnique = vi.mocked(prisma.user.findUnique);

async function expiredAccessToken() {
  return new SignJWT({
    appId: "app_1",
    clientId: "opco_app_client_1",
    email: "user@example.com",
    type: apiAccessTokenType,
  })
    .setProtectedHeader({ alg: apiJwtAlgorithm, typ: "JWT" })
    .setSubject("user_1")
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(getApiAuthSecret());
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.API_AUTH_SECRET = "test-api-auth-secret";
  membershipFindMany.mockResolvedValue([
    { organization: { active: true }, organizationId: "org_1" },
  ] as never);
  externalAppFindUnique.mockResolvedValue({
    active: true,
    clientId: "opco_app_client_1",
    id: "app_1",
    name: "Bodega",
    organizationId: "org_1",
    slug: "bodega",
  } as never);
});

const testApp = {
  clientId: "opco_app_client_1",
  id: "app_1",
  name: "Bodega",
  slug: "bodega",
};

const testUser = {
  email: "user@example.com",
  id: "user_1",
  name: "User One",
};

async function apiRequestWithUserToken(userId = "user_1") {
  const token = await signApiAccessToken({
    app: testApp,
    user: {
      ...testUser,
      id: userId,
    },
  });

  return new Request("http://localhost/api/v1/contracts/contract_1", {
    headers: { authorization: `Bearer ${token}` },
  });
}

async function responseBody(response: Response) {
  return response.json() as Promise<unknown>;
}

describe("API auth bearer tokens", () => {
  it("signs and verifies an access token payload", async () => {
    const token = await signApiAccessToken({
      app: testApp,
      user: testUser,
    });

    const result = await verifyApiAccessToken(token);

    expect(result).toEqual({
      ok: true,
      payload: {
        appId: "app_1",
        clientId: "opco_app_client_1",
        email: "user@example.com",
        sub: "user_1",
        type: "access",
      },
    });
  });

  it("rejects invalid and expired tokens distinctly", async () => {
    await expect(verifyApiAccessToken("not-a-jwt")).resolves.toEqual({
      ok: false,
      reason: "invalid-token",
    });

    await expect(verifyApiAccessToken(await expiredAccessToken())).resolves.toEqual({
      ok: false,
      reason: "expired-token",
    });
  });

  it("requires API_AUTH_SECRET for signing and verification", async () => {
    delete process.env.API_AUTH_SECRET;

    await expect(signApiAccessToken({
      app: testApp,
      user: {
        email: "user@example.com",
        id: "user_1",
        name: null,
      },
    })).rejects.toBeInstanceOf(ApiAuthConfigurationError);
  });

  it("extracts only Bearer authorization tokens", () => {
    expect(extractBearerToken(new Request("http://localhost/api/v1/me"))).toEqual({
      ok: false,
      reason: "missing-token",
    });

    expect(extractBearerToken(new Request("http://localhost/api/v1/me", {
      headers: { authorization: "Basic abc" },
    }))).toEqual({
      ok: false,
      reason: "invalid-authorization-scheme",
    });

    expect(extractBearerToken(new Request("http://localhost/api/v1/me", {
      headers: { authorization: "Bearer token-value" },
    }))).toEqual({
      ok: true,
      token: "token-value",
    });
  });

  it("returns the authenticated user for a valid bearer token", async () => {
    userFindUnique.mockResolvedValueOnce({
      email: "user@example.com",
      id: "user_1",
      name: "User One",
    } as never);

    const token = await signApiAccessToken({
      app: testApp,
      user: testUser,
    });

    await expect(getAuthenticatedApiUser(new Request("http://localhost/api/v1/me", {
      headers: { authorization: `Bearer ${token}` },
    }))).resolves.toEqual({
      ok: true,
      app: testApp,
      token: {
        appId: "app_1",
        clientId: "opco_app_client_1",
        email: "user@example.com",
        sub: "user_1",
        type: "access",
      },
      user: {
        email: "user@example.com",
        id: "user_1",
        name: "User One",
      },
    });
  });

  it("distinguishes when the token user no longer exists", async () => {
    userFindUnique.mockResolvedValueOnce(null);

    const token = await signApiAccessToken({
      app: testApp,
      user: {
        email: "deleted@example.com",
        id: "user_deleted",
        name: null,
      },
    });

    await expect(getAuthenticatedApiUser(new Request("http://localhost/api/v1/me", {
      headers: { authorization: `Bearer ${token}` },
    }))).resolves.toEqual({
      ok: false,
      reason: "user-not-found",
    });
  });

  it("rejects existing bearer tokens for inactive users", async () => {
    userFindUnique.mockResolvedValueOnce({
      active: false,
      email: "user@example.com",
      id: "user_1",
      name: "User One",
    } as never);

    const token = await signApiAccessToken({
      app: testApp,
      user: testUser,
    });

    await expect(getAuthenticatedApiUser(new Request("http://localhost/api/v1/me", {
      headers: { authorization: `Bearer ${token}` },
    }))).resolves.toEqual({
      ok: false,
      reason: "user-inactive",
    });
  });

  it("rejects tokens missing app claims", async () => {
    const token = await new SignJWT({
      email: "user@example.com",
      type: apiAccessTokenType,
    })
      .setProtectedHeader({ alg: apiJwtAlgorithm, typ: "JWT" })
      .setSubject("user_1")
      .setIssuedAt()
      .setExpirationTime("3600s")
      .sign(getApiAuthSecret());

    await expect(verifyApiAccessToken(token)).resolves.toEqual({
      ok: false,
      reason: "invalid-token",
    });
  });

  it("rejects tokens when the app was deleted or deactivated after issue", async () => {
    userFindUnique.mockResolvedValue({
      email: "user@example.com",
      id: "user_1",
      name: "User One",
    } as never);

    const token = await signApiAccessToken({
      app: testApp,
      user: testUser,
    });

    externalAppFindUnique.mockResolvedValueOnce(null);
    await expect(getAuthenticatedApiUser(new Request("http://localhost/api/v1/me", {
      headers: { authorization: `Bearer ${token}` },
    }))).resolves.toEqual({
      ok: false,
      reason: "app-not-found",
    });

    externalAppFindUnique.mockResolvedValueOnce({
      active: false,
      clientId: "opco_app_client_1",
      id: "app_1",
      name: "Bodega",
      organizationId: "org_1",
      slug: "bodega",
    } as never);
    await expect(getAuthenticatedApiUser(new Request("http://localhost/api/v1/me", {
      headers: { authorization: `Bearer ${token}` },
    }))).resolves.toEqual({
      ok: false,
      reason: "app-inactive",
    });
  });

  it("rejects tokens when the app no longer belongs to the user's organization", async () => {
    userFindUnique.mockResolvedValueOnce({
      email: "user@example.com",
      id: "user_1",
      name: "User One",
    } as never);
    externalAppFindUnique.mockResolvedValueOnce({
      active: true,
      clientId: "opco_app_client_1",
      id: "app_1",
      name: "Bodega",
      organizationId: "org_foreign",
      slug: "bodega",
    } as never);

    const token = await signApiAccessToken({
      app: testApp,
      user: testUser,
    });

    await expect(getAuthenticatedApiUser(new Request("http://localhost/api/v1/me", {
      headers: { authorization: `Bearer ${token}` },
    }))).resolves.toEqual({
      ok: false,
      reason: "app-organization-mismatch",
    });
  });

  it("rejects bearer tokens when the user's organization is inactive", async () => {
    userFindUnique.mockResolvedValueOnce({
      active: true,
      email: "user@example.com",
      id: "user_1",
      name: "User One",
    } as never);
    membershipFindMany.mockResolvedValueOnce([
      { organization: { active: false }, organizationId: "org_1" },
    ] as never);

    const token = await signApiAccessToken({
      app: testApp,
      user: testUser,
    });

    await expect(getAuthenticatedApiUser(new Request("http://localhost/api/v1/me", {
      headers: { authorization: `Bearer ${token}` },
    }))).resolves.toEqual({
      ok: false,
      reason: "organization-inactive",
    });
  });
});

describe("API auth token constants", () => {
  it("uses an explicit HS256 JWT and one-hour lifetime", () => {
    expect(apiJwtAlgorithm).toBe("HS256");
    expect(apiAccessTokenExpiresIn).toBe(3600);
  });
});

describe("API contract access", () => {
  it("returns authorized contract context when the user belongs to the contract organization", async () => {
    userFindUnique.mockResolvedValueOnce({
      email: "user@example.com",
      id: "user_1",
      name: "User One",
    } as never);
    contractFindFirst.mockResolvedValueOnce({
      id: "contract_1",
      name: "Contrato A",
      organization: {
        id: "org_1",
        name: "Organizacion A",
      },
      organizationId: "org_1",
    } as never);
    membershipFindUnique.mockResolvedValueOnce({
      role: "ADMIN",
    } as never);

    await expect(requireApiContractAccess(
      await apiRequestWithUserToken(),
      "contract_1",
    )).resolves.toEqual({
      ok: true,
      context: {
        app: testApp,
        contract: {
          id: "contract_1",
          name: "Contrato A",
          organization: {
            id: "org_1",
            name: "Organizacion A",
          },
        },
        membership: {
          role: "ADMIN",
        },
        user: {
          email: "user@example.com",
          id: "user_1",
          name: "User One",
        },
      },
    });
    expect(contractFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "contract_1",
        organization: {
          active: true,
        },
        status: "ACTIVE",
      },
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

  it("returns 404 when the active contract does not exist", async () => {
    userFindUnique.mockResolvedValueOnce({
      email: "user@example.com",
      id: "user_1",
      name: null,
    } as never);
    contractFindFirst.mockResolvedValueOnce(null);

    const result = await requireApiContractAccess(
      await apiRequestWithUserToken(),
      "missing_contract",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(404);
      expect(await responseBody(result.response)).toEqual({
        ok: false,
        error: {
          code: "CONTRACT_NOT_FOUND",
          message: "Contrato no encontrado",
        },
      });
    }
  });

  it("returns 403 without cross-tenant access when the contract belongs to another organization", async () => {
    userFindUnique.mockResolvedValueOnce({
      email: "user@example.com",
      id: "user_1",
      name: null,
    } as never);
    contractFindFirst.mockResolvedValueOnce({
      id: "contract_foreign",
      name: "Contrato Externo",
      organization: {
        id: "org_foreign",
        name: "Organizacion Externa",
      },
      organizationId: "org_foreign",
    } as never);
    membershipFindUnique.mockResolvedValueOnce(null);

    const result = await requireApiContractAccess(
      await apiRequestWithUserToken(),
      "contract_foreign",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await responseBody(result.response)).toEqual({
        ok: false,
        error: {
          code: "CONTRACT_FORBIDDEN",
          message: "No tienes acceso a este contrato",
        },
      });
    }
  });

  it("returns 401 when the bearer token is missing or invalid", async () => {
    const missing = await requireApiContractAccess(
      new Request("http://localhost/api/v1/contracts/contract_1"),
      "contract_1",
    );
    const invalid = await requireApiContractAccess(
      new Request("http://localhost/api/v1/contracts/contract_1", {
        headers: { authorization: "Bearer not-a-token" },
      }),
      "contract_1",
    );

    expect(missing.ok).toBe(false);
    expect(invalid.ok).toBe(false);

    if (!missing.ok) {
      expect(missing.response.status).toBe(401);
      expect(await responseBody(missing.response)).toEqual({
        ok: false,
        error: {
          code: "TOKEN_MISSING",
          message: "Token no valido",
        },
      });
    }

    if (!invalid.ok) {
      expect(invalid.response.status).toBe(401);
      expect(await responseBody(invalid.response)).toEqual({
        ok: false,
        error: {
          code: "TOKEN_INVALID",
          message: "Token no valido",
        },
      });
    }
  });

  it("returns 401 when the token user no longer exists", async () => {
    userFindUnique.mockResolvedValueOnce(null);

    const result = await requireApiContractAccess(
      await apiRequestWithUserToken("deleted_user"),
      "contract_1",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(await responseBody(result.response)).toEqual({
        ok: false,
        error: {
          code: "TOKEN_USER_NOT_FOUND",
          message: "Token no valido",
        },
      });
    }
    expect(contractFindFirst).not.toHaveBeenCalled();
    expect(membershipFindUnique).not.toHaveBeenCalled();
  });

  it("returns 503 instead of token invalid when bearer DB validation is unavailable", async () => {
    const connectionError = Object.assign(
      new Error("Server has closed the connection"),
      { code: "P1017", name: "PrismaClientKnownRequestError" },
    );
    userFindUnique.mockRejectedValue(connectionError);

    const result = await requireApiUser(await apiRequestWithUserToken());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(503);
      expect(await responseBody(result.response)).toEqual({
        ok: false,
        error: {
          code: "DB_UNAVAILABLE",
          message: "Servicio temporalmente no disponible.",
        },
      });
    }
    expect(userFindUnique).toHaveBeenCalledTimes(2);
    expect(contractFindFirst).not.toHaveBeenCalled();
  });
});
