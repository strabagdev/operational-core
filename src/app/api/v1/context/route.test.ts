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
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

const externalAppFindUnique = vi.mocked(prisma.externalApp.findUnique);
const membershipFindUnique = vi.mocked(prisma.membership.findUnique);
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
  organizationId: "org_1",
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
  organizationActive = true,
  role = "ADMIN",
}: {
  contracts?: Array<{ id: string; name: string }>;
  organizationActive?: boolean;
  organizationId?: string;
  organizationName?: string;
  role?: "ADMIN" | "MEMBER";
} = {}) {
  return {
    id: `membership_${organizationId}`,
    organization: {
      active: organizationActive,
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
    membershipFindUnique.mockResolvedValue({
      ...membershipFixture({
        contracts: [
          { id: "contract_1", name: "Contrato A" },
          { id: "contract_2", name: "Contrato B" },
        ],
        role: "ADMIN",
      }),
      organization: {
        active: true,
        contracts: [
          { id: "contract_1", name: "Contrato A" },
          { id: "contract_2", name: "Contrato B" },
        ],
        id: "org_1",
        name: "Organizacion A",
      },
    } as never);

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
    expect(membershipFindUnique).toHaveBeenCalledWith(expect.objectContaining({
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
        userId_organizationId: {
          organizationId: "org_1",
          userId: "user_1",
        },
      },
    }));
  });

  it("returns an empty contracts array when the user organization has no active contracts", async () => {
    userFindUnique.mockResolvedValueOnce({
      email: "member@example.com",
      id: "user_1",
      name: null,
    } as never);
    membershipFindUnique.mockResolvedValue({
      ...membershipFixture({
        contracts: [],
        role: "MEMBER",
      }),
      organization: {
        active: true,
        contracts: [],
        id: "org_1",
        name: "Organizacion A",
      },
    } as never);

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
    membershipFindUnique.mockResolvedValue({
      ...membershipFixture({
        role: "MEMBER",
      }),
      organization: {
        active: true,
        contracts: [{ id: "contract_1", name: "Contrato A" }],
        id: "org_1",
        name: "Organizacion A",
      },
    } as never);

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
    expect(membershipFindUnique).not.toHaveBeenCalled();
  });

  it("rejects context when the token app is inactive or cross-tenant", async () => {
    userFindUnique.mockResolvedValue({
      email: "user@example.com",
      id: "user_1",
      name: "User One",
    } as never);
    membershipFindUnique.mockResolvedValue({
      organization: { active: true },
      role: "MEMBER",
    } as never);

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
      organizationId: "org_2",
      slug: "bodega",
    } as never);
    membershipFindUnique.mockResolvedValueOnce(null);

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

  it("rejects context when the user's organization is inactive", async () => {
    userFindUnique.mockResolvedValueOnce({
      active: true,
      email: "user@example.com",
      id: "user_1",
      name: "User One",
    } as never);
    membershipFindUnique.mockResolvedValueOnce({
      organization: { active: false },
      role: "MEMBER",
    } as never);

    const response = await GET(await contextRequest());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "TOKEN_ORGANIZATION_INACTIVE",
        message: "Organizacion inactiva",
      },
    });
  });

  it("returns the app organization when the user has multiple memberships", async () => {
    userFindUnique.mockResolvedValueOnce({
      email: "multi@example.com",
      id: "user_1",
      name: "Multi Org",
    } as never);
    externalAppFindUnique.mockResolvedValueOnce({
      active: true,
      clientId: "opco_app_client_1",
      id: "app_1",
      name: "Bodega",
      organizationId: "org_2",
      slug: "bodega",
    } as never);
    membershipFindUnique.mockResolvedValue({
      ...membershipFixture({
        contracts: [{ id: "contract_2", name: "Contrato B" }],
        organizationId: "org_2",
        organizationName: "Organizacion B",
        role: "MEMBER",
      }),
      organization: {
        active: true,
        contracts: [{ id: "contract_2", name: "Contrato B" }],
        id: "org_2",
        name: "Organizacion B",
      },
    } as never);

    const response = await GET(await contextRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        contracts: [
          {
            id: "contract_2",
            name: "Contrato B",
            role: "MEMBER",
          },
        ],
        organization: {
          id: "org_2",
          name: "Organizacion B",
        },
      },
    });
  });
});
