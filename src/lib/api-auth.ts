import bcrypt from "bcrypt";
import { errors, jwtVerify, SignJWT } from "jose";

import {
  conflict,
  forbidden,
  internalError,
  notFound,
  unauthorized,
} from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export const apiAccessTokenExpiresIn = 60 * 60;
export const apiAccessTokenType = "access";
export const apiJwtAlgorithm = "HS256";

export type ApiAccessTokenPayload = {
  appId: string;
  clientId: string;
  email: string;
  sub: string;
  type: typeof apiAccessTokenType;
};

export type ApiAuthenticatedUser = {
  id: string;
  email: string;
  name: string | null;
};

export type ApiAuthenticatedApp = {
  clientId: string;
  id: string;
  name: string;
  slug: string;
};

export type ApiOrganizationContext = {
  id: string;
  name: string;
};

export type ApiContractContext = {
  id: string;
  name: string;
  role: "ADMIN" | "MEMBER";
};

export type ApiOperationalContext = {
  organization: ApiOrganizationContext;
  contracts: ApiContractContext[];
};

export type ApiAuthorizedContractContext = {
  app: ApiAuthenticatedApp;
  contract: {
    id: string;
    name: string;
    organization: ApiOrganizationContext;
  };
  membership: {
    role: "ADMIN" | "MEMBER";
  };
  user: ApiAuthenticatedUser;
};

export type ApiAuthFailureReason =
  | "missing-token"
  | "invalid-authorization-scheme"
  | "invalid-token"
  | "expired-token"
  | "user-not-found"
  | "app-not-found"
  | "app-inactive"
  | "app-organization-mismatch"
  | "multiple-organizations";

export type ApiAuthResult =
  | {
      app: ApiAuthenticatedApp;
      ok: true;
      token: ApiAccessTokenPayload;
      user: ApiAuthenticatedUser;
    }
  | {
      ok: false;
      reason: ApiAuthFailureReason;
    };

export type ApiUserRequirementResult =
  | {
      app: ApiAuthenticatedApp;
      ok: true;
      token: ApiAccessTokenPayload;
      user: ApiAuthenticatedUser;
    }
  | {
      ok: false;
      response: Response;
    };

export type ApiContractAccessRequirementResult =
  | {
      ok: true;
      context: ApiAuthorizedContractContext;
    }
  | {
      ok: false;
      response: Response;
    };

export type ApiOperationalContextResult =
  | {
      ok: true;
      context: ApiOperationalContext;
    }
  | {
      ok: false;
      response: Response;
    };

export type ApiTokenVerificationResult =
  | {
      ok: true;
      payload: ApiAccessTokenPayload;
    }
  | {
      ok: false;
      reason: Extract<ApiAuthFailureReason, "expired-token" | "invalid-token">;
    };

export type ApiLoginClientResult =
  | {
      app: ApiAuthenticatedApp;
      ok: true;
    }
  | {
      ok: false;
      response: Response;
    };

export class ApiAuthConfigurationError extends Error {
  constructor(message = "API_AUTH_SECRET is required. Define it in .env.") {
    super(message);
    this.name = "ApiAuthConfigurationError";
  }
}

const apiAuthErrorCodes = {
  "app-inactive": "TOKEN_APP_INACTIVE",
  "app-not-found": "TOKEN_APP_INVALID",
  "app-organization-mismatch": "TOKEN_APP_INVALID",
  "expired-token": "TOKEN_EXPIRED",
  "invalid-authorization-scheme": "INVALID_AUTHORIZATION_SCHEME",
  "invalid-token": "TOKEN_INVALID",
  "missing-token": "TOKEN_MISSING",
  "multiple-organizations": "MULTIPLE_ORGANIZATIONS_NOT_SUPPORTED",
  "user-not-found": "TOKEN_USER_NOT_FOUND",
} as const;

function apiAuthFailureResponse(reason: ApiAuthFailureReason) {
  if (reason === "app-inactive") {
    return forbidden("Aplicacion inactiva", apiAuthErrorCodes[reason]);
  }

  if (reason === "multiple-organizations") {
    return conflict(
      "El usuario pertenece a multiples organizaciones",
      apiAuthErrorCodes[reason],
    );
  }

  return unauthorized("Token no valido", apiAuthErrorCodes[reason]);
}

function apiAuthConfigurationFailureResponse() {
  return internalError(
    "Autenticacion API no configurada",
    "API_AUTH_SECRET_MISSING",
  );
}

export function getApiAuthSecret() {
  const secret = process.env.API_AUTH_SECRET;

  if (!secret) {
    throw new ApiAuthConfigurationError();
  }

  return new TextEncoder().encode(secret);
}

export function normalizeApiLoginEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function verifyApiCredentials(input: {
  email: string;
  password: string;
}) {
  const user = await prisma.user.findUnique({
    select: {
      email: true,
      id: true,
      name: true,
      passwordHash: true,
    },
    where: {
      email: normalizeApiLoginEmail(input.email),
    },
  });

  if (!user?.passwordHash) {
    return null;
  }

  const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);

  if (!isValidPassword) {
    return null;
  }

  return {
    email: user.email,
    id: user.id,
    name: user.name,
  };
}

export async function getApiUserOrganization(userId: string) {
  const memberships = await prisma.membership.findMany({
    orderBy: {
      organizationId: "asc",
    },
    select: {
      organizationId: true,
    },
    where: {
      userId,
    },
  });
  const organizationIds = [...new Set(
    memberships.map((membership) => membership.organizationId),
  )];

  if (organizationIds.length === 0) {
    return {
      ok: false as const,
      reason: "user-not-found" as const,
    };
  }

  if (organizationIds.length > 1) {
    return {
      ok: false as const,
      reason: "multiple-organizations" as const,
    };
  }

  return {
    ok: true as const,
    organizationId: organizationIds[0],
  };
}

export async function resolveApiLoginExternalApp({
  clientId,
  userId,
}: {
  clientId: string;
  userId: string;
}): Promise<ApiLoginClientResult> {
  const organization = await getApiUserOrganization(userId);

  if (!organization.ok) {
    return {
      ok: false,
      response: apiAuthFailureResponse(organization.reason),
    };
  }

  const app = await prisma.externalApp.findUnique({
    select: {
      active: true,
      clientId: true,
      id: true,
      name: true,
      organizationId: true,
      slug: true,
    },
    where: {
      clientId,
    },
  });

  if (!app || app.organizationId !== organization.organizationId) {
    return {
      ok: false,
      response: unauthorized("Aplicacion no valida", "INVALID_CLIENT"),
    };
  }

  if (!app.active) {
    return {
      ok: false,
      response: forbidden("Aplicacion inactiva", "CLIENT_INACTIVE"),
    };
  }

  return {
    app: {
      clientId: app.clientId,
      id: app.id,
      name: app.name,
      slug: app.slug,
    },
    ok: true,
  };
}

export async function signApiAccessToken({
  app,
  user,
}: {
  app: ApiAuthenticatedApp;
  user: ApiAuthenticatedUser;
}) {
  return new SignJWT({
    appId: app.id,
    clientId: app.clientId,
    email: user.email,
    type: apiAccessTokenType,
  })
    .setProtectedHeader({ alg: apiJwtAlgorithm, typ: "JWT" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${apiAccessTokenExpiresIn}s`)
    .sign(getApiAuthSecret());
}

export function extractBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return {
      ok: false as const,
      reason: "missing-token" as const,
    };
  }

  const [scheme, token, extra] = authorization.trim().split(/\s+/);

  if (scheme !== "Bearer" || !token || extra) {
    return {
      ok: false as const,
      reason: "invalid-authorization-scheme" as const,
    };
  }

  return {
    ok: true as const,
    token,
  };
}

export async function verifyApiAccessToken(
  token: string,
): Promise<ApiTokenVerificationResult> {
  const secret = getApiAuthSecret();

  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [apiJwtAlgorithm],
      typ: "JWT",
    });

    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.appId !== "string" ||
      typeof payload.clientId !== "string" ||
      payload.type !== apiAccessTokenType
    ) {
      return {
        ok: false as const,
        reason: "invalid-token" as const,
      };
    }

    return {
      ok: true as const,
      payload: {
        appId: payload.appId,
        clientId: payload.clientId,
        email: payload.email,
        sub: payload.sub,
        type: apiAccessTokenType,
      },
    };
  } catch (error) {
    if (error instanceof errors.JWTExpired) {
      return {
        ok: false as const,
        reason: "expired-token" as const,
      };
    }

    return {
      ok: false as const,
      reason: "invalid-token" as const,
    };
  }
}

export async function getAuthenticatedApiUser(request: Request): Promise<ApiAuthResult> {
  const bearerToken = extractBearerToken(request);

  if (!bearerToken.ok) {
    return bearerToken;
  }

  const verifiedToken = await verifyApiAccessToken(bearerToken.token);

  if (!verifiedToken.ok) {
    return verifiedToken;
  }

  const user = await prisma.user.findUnique({
    select: {
      email: true,
      id: true,
      name: true,
    },
    where: {
      id: verifiedToken.payload.sub,
    },
  });

  if (!user) {
    return {
      ok: false,
      reason: "user-not-found",
    };
  }

  const organization = await getApiUserOrganization(user.id);

  if (!organization.ok) {
    return {
      ok: false,
      reason: organization.reason,
    };
  }

  const app = await prisma.externalApp.findUnique({
    select: {
      active: true,
      clientId: true,
      id: true,
      name: true,
      organizationId: true,
      slug: true,
    },
    where: {
      id: verifiedToken.payload.appId,
    },
  });

  if (!app || app.clientId !== verifiedToken.payload.clientId) {
    return {
      ok: false,
      reason: "app-not-found",
    };
  }

  if (!app.active) {
    return {
      ok: false,
      reason: "app-inactive",
    };
  }

  if (app.organizationId !== organization.organizationId) {
    return {
      ok: false,
      reason: "app-organization-mismatch",
    };
  }

  return {
    app: {
      clientId: app.clientId,
      id: app.id,
      name: app.name,
      slug: app.slug,
    },
    ok: true,
    token: verifiedToken.payload,
    user,
  };
}

export async function requireApiUser(
  request: Request,
): Promise<ApiUserRequirementResult> {
  try {
    const authResult = await getAuthenticatedApiUser(request);

    if (!authResult.ok) {
      return {
        ok: false,
        response: apiAuthFailureResponse(authResult.reason),
      };
    }

    return authResult;
  } catch (error) {
    if (error instanceof ApiAuthConfigurationError) {
      return {
        ok: false,
        response: apiAuthConfigurationFailureResponse(),
      };
    }

    throw error;
  }
}

export async function getApiOperationalContext(
  userId: string,
): Promise<ApiOperationalContextResult> {
  const memberships = await prisma.membership.findMany({
    include: {
      organization: {
        include: {
          contracts: {
            where: {
              status: "ACTIVE",
            },
            orderBy: {
              name: "asc",
            },
          },
        },
      },
    },
    orderBy: [
      { organization: { name: "asc" } },
      { role: "asc" },
    ],
    where: {
      userId,
    },
  });

  const organizationIds = new Set(
    memberships.map((membership) => membership.organizationId),
  );

  if (organizationIds.size > 1) {
    return {
      ok: false,
      response: conflict(
        "El usuario pertenece a multiples organizaciones",
        "MULTIPLE_ORGANIZATIONS_NOT_SUPPORTED",
      ),
    };
  }

  if (memberships.length === 0) {
    return {
      ok: false,
      response: notFound(
        "Contexto operacional no encontrado",
        "OPERATIONAL_CONTEXT_NOT_FOUND",
      ),
    };
  }

  const membership = memberships[0];

  return {
    ok: true,
    context: {
      contracts: membership.organization.contracts.map((contract) => ({
        id: contract.id,
        name: contract.name,
        role: membership.role,
      })),
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
      },
    },
  };
}

export async function requireApiContractAccess(
  request: Request,
  contractId: string,
): Promise<ApiContractAccessRequirementResult> {
  const userResult = await requireApiUser(request);

  if (!userResult.ok) {
    return userResult;
  }

  const contract = await prisma.contract.findFirst({
    select: {
      id: true,
      name: true,
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
      organizationId: true,
    },
    where: {
      id: contractId,
      status: "ACTIVE",
    },
  });

  if (!contract) {
    return {
      ok: false,
      response: notFound("Contrato no encontrado", "CONTRACT_NOT_FOUND"),
    };
  }

  const membership = await prisma.membership.findUnique({
    select: {
      role: true,
    },
    where: {
      userId_organizationId: {
        organizationId: contract.organizationId,
        userId: userResult.user.id,
      },
    },
  });

  if (!membership) {
    return {
      ok: false,
      response: forbidden(
        "No tienes acceso a este contrato",
        "CONTRACT_FORBIDDEN",
      ),
    };
  }

  return {
    ok: true,
    context: {
      app: userResult.app,
      contract: {
        id: contract.id,
        name: contract.name,
        organization: contract.organization,
      },
      membership,
      user: userResult.user,
    },
  };
}
