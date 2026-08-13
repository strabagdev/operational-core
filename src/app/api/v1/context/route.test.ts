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

async function contextRequest(userId = "user_1") {
  const token = await signApiAccessToken({
    app: testApp,
    user: {
      email: "user@example.com",
      id: userId,
      name: "User One",
    },
  });

  return new Request("http://localhost/api/v1/context", {
    headers: { authorization: `Bearer ${token}` },
  });
}

function membershipFixture({
  contracts = [
    { id: "contract_1", name: "Contrato A" },
  ],
  organizationId = "org_1",
  organizationName = "Organizacion A",
  role = "ADMIN",
}: {
  contracts?: Array<{ id: string; name: string }>;
  organizationId?: string;
  organizationName?: string;
  role?: "ADMIN" | "MEMBER";
} = {}) {
  return {
    id: `membership_${organizationId}`,
    organization: {
      contracts,
      id: organizationId,
      name: organizationName,
    },
    organizationId,
    role,
    userId: "user_1",
  };
}

describe("GET /api/v1/context", () => {
  it("returns the user's organization and active contracts with ADMIN role", async () => {
    userFindUnique.mockResolvedValueOnce({
      email: "user@example.com",
      id: "user_1",
      name: "User One",
    } as never);
    membershipFindMany
      .mockResolvedValueOnce([{ organizationId: "org_1" }] as never)
      .mockResolvedValueOnce([
        membershipFixture({
          contracts: [
            { id: "contract_1", name: "Contrato A" },
            { id: "contract_2", name: "Contrato B" },
          ],
          role: "ADMIN",
        }),
      ] as never);

    const response = await GET(await contextRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        organization: {
          id: "org_1",
          name: "Organizacion A",
        },
        contracts: [
          {
            id: "contract_1",
            name: "Contrato A",
            role: "ADMIN",
          },
          {
            id: "contract_2",
            name: "Contrato B",
            role: "ADMIN",
          },
        ],
      },
    });
    expect(membershipFindMany).toHaveBeenCalledWith(expect.objectContaining({
      include: {
        organization: {
          include: {
            contracts: {
              orderBy: {
                name: "asc",
              },
              where: {
                status: "ACTIVE",
              },
            },
          },
        },
      },
      where: {
        userId: "user_1",
      },
    }));
  });

  it("returns an empty contracts array when the user organization has no active contracts", async () => {
    userFindUnique.mockResolvedValueOnce({
      email: "member@example.com",
      id: "user_1",
      name: null,
    } as never);
    membershipFindMany
      .mockResolvedValueOnce([{ organizationId: "org_1" }] as never)
      .mockResolvedValueOnce([
        membershipFixture({
          contracts: [],
          role: "MEMBER",
        }),
      ] as never);

    const response = await GET(await contextRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        organization: {
          id: "org_1",
          name: "Organizacion A",
        },
        contracts: [],
      },
    });
  });

  it("returns the MEMBER role as the effective role for each contract", async () => {
    userFindUnique.mockResolvedValueOnce({
      email: "member@example.com",
      id: "user_1",
      name: "Member One",
    } as never);
    membershipFindMany
      .mockResolvedValueOnce([{ organizationId: "org_1" }] as never)
      .mockResolvedValueOnce([
        membershipFixture({
          role: "MEMBER",
        }),
      ] as never);

    const response = await GET(await contextRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        organization: {
          id: "org_1",
          name: "Organizacion A",
        },
        contracts: [
          {
            id: "contract_1",
            name: "Contrato A",
            role: "MEMBER",
          },
        ],
      },
    });
  });

  it("returns 401 when the token is missing or invalid", async () => {
    const missing = await GET(new Request("http://localhost/api/v1/context"));
    const invalid = await GET(new Request("http://localhost/api/v1/context", {
      headers: { authorization: "Bearer not-a-token" },
    }));

    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({
      ok: false,
      error: {
        code: "TOKEN_MISSING",
        message: "Token no valido",
      },
    });

    expect(invalid.status).toBe(401);
    expect(await invalid.json()).toEqual({
      ok: false,
      error: {
        code: "TOKEN_INVALID",
        message: "Token no valido",
      },
    });
  });

  it("returns 401 when the token user has been deleted", async () => {
    userFindUnique.mockResolvedValueOnce(null);

    const response = await GET(await contextRequest("deleted_user"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "TOKEN_USER_NOT_FOUND",
        message: "Token no valido",
      },
    });
    expect(membershipFindMany).not.toHaveBeenCalled();
  });

  it("rejects context when the token app is inactive or cross-tenant", async () => {
    userFindUnique.mockResolvedValue({
      email: "user@example.com",
      id: "user_1",
      name: "User One",
    } as never);
    membershipFindMany.mockResolvedValue([{ organizationId: "org_1" }] as never);

    externalAppFindUnique.mockResolvedValueOnce({
      active: false,
      clientId: "opco_app_client_1",
      id: "app_1",
      name: "Bodega",
      organizationId: "org_1",
      slug: "bodega",
    } as never);

    const inactive = await GET(await contextRequest());

    expect(inactive.status).toBe(403);
    expect(await inactive.json()).toEqual({
      ok: false,
      error: {
        code: "TOKEN_APP_INACTIVE",
        message: "Aplicacion inactiva",
      },
    });

    externalAppFindUnique.mockResolvedValueOnce({
      active: true,
      clientId: "opco_app_client_1",
      id: "app_1",
      name: "Bodega",
      organizationId: "org_foreign",
      slug: "bodega",
    } as never);

    const foreign = await GET(await contextRequest());

    expect(foreign.status).toBe(401);
    expect(await foreign.json()).toEqual({
      ok: false,
      error: {
        code: "TOKEN_APP_INVALID",
        message: "Token no valido",
      },
    });
  });

  it("does not choose an arbitrary organization when multiple memberships exist", async () => {
    userFindUnique.mockResolvedValueOnce({
      email: "multi@example.com",
      id: "user_1",
      name: "Multi Org",
    } as never);
    membershipFindMany.mockResolvedValueOnce([
      membershipFixture({
        organizationId: "org_1",
        organizationName: "Organizacion A",
      }),
      membershipFixture({
        organizationId: "org_2",
        organizationName: "Organizacion B",
        role: "MEMBER",
      }),
    ] as never);

    const response = await GET(await contextRequest());

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
