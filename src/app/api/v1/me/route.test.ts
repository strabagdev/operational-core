import { beforeEach, describe, expect, it, vi } from "vitest";

import { signApiAccessToken } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
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

const externalAppFindUnique = vi.mocked(prisma.externalApp.findUnique);
const membershipFindMany = vi.mocked(prisma.membership.findMany);
const userFindUnique = vi.mocked(prisma.user.findUnique);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.API_AUTH_SECRET = "test-api-auth-secret";
  membershipFindMany.mockResolvedValue([{ organizationId: "org_1" }] as never);
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

describe("GET /api/v1/me", () => {
  it("returns the authenticated user for a valid bearer token", async () => {
    userFindUnique.mockResolvedValueOnce({
      email: "user@example.com",
      id: "user_1",
      name: "User One",
    } as never);

    const token = await signApiAccessToken({
      app: testApp,
      user: {
        email: "user@example.com",
        id: "user_1",
        name: "User One",
      },
    });

    const response = await GET(new Request("http://localhost/api/v1/me", {
      headers: { authorization: `Bearer ${token}` },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        app: testApp,
        user: {
          email: "user@example.com",
          id: "user_1",
          name: "User One",
        },
      },
    });
  });

  it("returns 401 when the bearer token is missing", async () => {
    const response = await GET(new Request("http://localhost/api/v1/me"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "TOKEN_MISSING",
        message: "Token no valido",
      },
    });
  });

  it("returns 401 when the bearer token is invalid", async () => {
    const response = await GET(new Request("http://localhost/api/v1/me", {
      headers: { authorization: "Bearer not-a-jwt" },
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "TOKEN_INVALID",
        message: "Token no valido",
      },
    });
  });

  it("returns 401 when the token user no longer exists", async () => {
    userFindUnique.mockResolvedValueOnce(null);

    const token = await signApiAccessToken({
      app: testApp,
      user: {
        email: "deleted@example.com",
        id: "user_deleted",
        name: null,
      },
    });

    const response = await GET(new Request("http://localhost/api/v1/me", {
      headers: { authorization: `Bearer ${token}` },
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "TOKEN_USER_NOT_FOUND",
        message: "Token no valido",
      },
    });
  });

  it("rejects requests when the token app is inactive or deleted", async () => {
    userFindUnique.mockResolvedValue({
      email: "user@example.com",
      id: "user_1",
      name: "User One",
    } as never);
    const token = await signApiAccessToken({
      app: testApp,
      user: {
        email: "user@example.com",
        id: "user_1",
        name: "User One",
      },
    });

    externalAppFindUnique.mockResolvedValueOnce({
      active: false,
      clientId: "opco_app_client_1",
      id: "app_1",
      name: "Bodega",
      organizationId: "org_1",
      slug: "bodega",
    } as never);

    const inactive = await GET(new Request("http://localhost/api/v1/me", {
      headers: { authorization: `Bearer ${token}` },
    }));

    expect(inactive.status).toBe(403);
    expect(await inactive.json()).toEqual({
      ok: false,
      error: {
        code: "TOKEN_APP_INACTIVE",
        message: "Aplicacion inactiva",
      },
    });

    externalAppFindUnique.mockResolvedValueOnce(null);

    const deleted = await GET(new Request("http://localhost/api/v1/me", {
      headers: { authorization: `Bearer ${token}` },
    }));

    expect(deleted.status).toBe(401);
    expect(await deleted.json()).toEqual({
      ok: false,
      error: {
        code: "TOKEN_APP_INVALID",
        message: "Token no valido",
      },
    });
  });

  it("fails clearly when API_AUTH_SECRET is missing", async () => {
    delete process.env.API_AUTH_SECRET;

    const response = await GET(new Request("http://localhost/api/v1/me", {
      headers: { authorization: "Bearer token-value" },
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
});
