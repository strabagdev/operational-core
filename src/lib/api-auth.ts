import bcrypt from "bcrypt";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { errors, jwtVerify, SignJWT } from "jose";

import {
  conflict,
  forbidden,
  internalError,
  notFound,
  serviceUnavailable,
  unauthorized,
} from "@/lib/api-response";
import { isAuthorizedApiOrigin } from "@/lib/api-cors";
import { prisma } from "@/lib/prisma";
import {
  isDatabaseUnavailableError,
  withPrismaReadRetry,
} from "@/lib/prisma-resilience";

export const apiAccessTokenExpiresIn = 60 * 60;
export const apiRefreshTokenCookieName = "opco_api_refresh_token";
export const apiRefreshTokenExpiresIn = 30 * 24 * 60 * 60;
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
  | "user-inactive"
  | "app-not-found"
  | "app-inactive"
  | "app-organization-mismatch"
  | "organization-inactive"
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

type ApiOperationalMembershipRow = {
  organization: {
    active: boolean;
    contracts: Array<{
      id: string;
      name: string;
    }>;
    id: string;
    name: string;
  };
  organizationId: string;
  role: "ADMIN" | "MEMBER";
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

export type ApiRefreshTokenTransport = "native" | "web";

export type ApiRefreshTokenIssueResult = {
  expiresAt: Date;
  refreshToken: string;
  tokenId: string;
};

export type ApiRefreshFailureReason =
  | "missing-refresh-token"
  | "invalid-refresh-token"
  | "expired-refresh-token"
  | "revoked-refresh-token"
  | "refresh-token-reused"
  | "csrf-origin-invalid"
  | "user-not-found"
  | "user-inactive"
  | "app-not-found"
  | "app-inactive"
  | "app-organization-mismatch"
  | "organization-inactive"
  | "multiple-organizations";

export type ApiRefreshResult =
  | {
      accessToken: string;
      app: ApiAuthenticatedApp;
      issuedRefreshToken: ApiRefreshTokenIssueResult;
      ok: true;
      user: ApiAuthenticatedUser;
    }
  | {
      ok: false;
      reason: ApiRefreshFailureReason;
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
  "organization-inactive": "TOKEN_ORGANIZATION_INACTIVE",
  "user-not-found": "TOKEN_USER_NOT_FOUND",
  "user-inactive": "TOKEN_USER_INACTIVE",
} as const;

const apiRefreshErrorCodes = {
  "app-inactive": "REFRESH_APP_INACTIVE",
  "app-not-found": "REFRESH_APP_INVALID",
  "app-organization-mismatch": "REFRESH_APP_INVALID",
  "csrf-origin-invalid": "REFRESH_ORIGIN_INVALID",
  "expired-refresh-token": "REFRESH_TOKEN_EXPIRED",
  "invalid-refresh-token": "REFRESH_TOKEN_INVALID",
  "missing-refresh-token": "REFRESH_TOKEN_MISSING",
  "multiple-organizations": "MULTIPLE_ORGANIZATIONS_NOT_SUPPORTED",
  "organization-inactive": "REFRESH_ORGANIZATION_INACTIVE",
  "refresh-token-reused": "REFRESH_TOKEN_REUSED",
  "revoked-refresh-token": "REFRESH_TOKEN_REVOKED",
  "user-inactive": "REFRESH_USER_INACTIVE",
  "user-not-found": "REFRESH_USER_NOT_FOUND",
} as const;

function apiAuthFailureResponse(reason: ApiAuthFailureReason) {
  if (reason === "app-inactive") {
    return forbidden("Aplicacion inactiva", apiAuthErrorCodes[reason]);
  }

  if (reason === "organization-inactive") {
    return forbidden("Organizacion inactiva", apiAuthErrorCodes[reason]);
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

export function apiDatabaseUnavailableResponse() {
  return serviceUnavailable(
    "Servicio temporalmente no disponible.",
    "DB_UNAVAILABLE",
  );
}

export function apiRefreshFailureResponse(reason: ApiRefreshFailureReason) {
  if (reason === "app-inactive") {
    return forbidden("Aplicacion inactiva", apiRefreshErrorCodes[reason]);
  }

  if (reason === "organization-inactive") {
    return forbidden("Organizacion inactiva", apiRefreshErrorCodes[reason]);
  }

  if (reason === "csrf-origin-invalid") {
    return forbidden("Origin no autorizado", apiRefreshErrorCodes[reason]);
  }

  if (reason === "multiple-organizations") {
    return conflict(
      "El usuario pertenece a multiples organizaciones",
      apiRefreshErrorCodes[reason],
    );
  }

  return unauthorized("Refresh token no valido", apiRefreshErrorCodes[reason]);
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

export function getApiRefreshTokenTransport(request: Request): ApiRefreshTokenTransport {
  return request.headers.get("x-opco-client-platform")?.toLowerCase() === "native"
    ? "native"
    : "web";
}

export function generateApiRefreshToken() {
  return `opco_rt_${randomBytes(32).toString("base64url")}`;
}

export function hashApiRefreshToken(token: string) {
  return createHmac("sha256", Buffer.from(getApiAuthSecret()))
    .update(token)
    .digest("hex");
}

export function apiRefreshTokenCookieHeader(token: string) {
  return [
    `${apiRefreshTokenCookieName}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Secure",
    "SameSite=None",
    "Path=/api/v1/auth",
    `Max-Age=${apiRefreshTokenExpiresIn}`,
  ].join("; ");
}

export function apiRefreshTokenCookieDeletionHeader() {
  return [
    `${apiRefreshTokenCookieName}=`,
    "HttpOnly",
    "Secure",
    "SameSite=None",
    "Path=/api/v1/auth",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ].join("; ");
}

export function extractApiRefreshTokenCookie(request: Request) {
  const cookie = request.headers.get("cookie");

  if (!cookie) {
    return null;
  }

  for (const part of cookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");

    if (rawName === apiRefreshTokenCookieName) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return null;
}

export function requireApiRefreshCookieOrigin(request: Request) {
  return isAuthorizedApiOrigin(request)
    ? { ok: true as const }
    : { ok: false as const, reason: "csrf-origin-invalid" as const };
}

export async function verifyApiCredentials(input: {
  email: string;
  password: string;
}) {
  const user = await withPrismaReadRetry(
    () => prisma.user.findUnique({
      select: {
        active: true,
        email: true,
        id: true,
        name: true,
        passwordHash: true,
      },
      where: {
        email: normalizeApiLoginEmail(input.email),
      },
    }),
    { context: "api.auth.login.user" },
  );

  if (!user?.passwordHash || user.active === false) {
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
  const memberships = await withPrismaReadRetry(
    () => prisma.membership.findMany({
      orderBy: {
        organizationId: "asc",
      },
      select: {
        organization: {
          select: {
            active: true,
          },
        },
        organizationId: true,
      },
      where: {
        userId,
      },
    }),
    { context: "api.auth.user.organization" },
  );
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

  const membership = memberships[0];

  if (membership?.organization?.active === false) {
    return {
      ok: false as const,
      reason: "organization-inactive" as const,
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

  const app = await withPrismaReadRetry(
    () => prisma.externalApp.findUnique({
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
    }),
    { context: "api.auth.login.app" },
  );

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

export async function issueApiRefreshToken({
  app,
  familyId = randomUUID(),
  user,
}: {
  app: ApiAuthenticatedApp;
  familyId?: string;
  user: ApiAuthenticatedUser;
}): Promise<ApiRefreshTokenIssueResult> {
  const refreshToken = generateApiRefreshToken();
  const expiresAt = new Date(Date.now() + apiRefreshTokenExpiresIn * 1000);
  const record = await prisma.apiRefreshToken.create({
    data: {
      expiresAt,
      externalAppId: app.id,
      familyId,
      tokenHash: hashApiRefreshToken(refreshToken),
      userId: user.id,
    },
    select: {
      id: true,
    },
  });

  return {
    expiresAt,
    refreshToken,
    tokenId: record.id,
  };
}

function buildApiRefreshTokenIssue() {
  const refreshToken = generateApiRefreshToken();

  return {
    expiresAt: new Date(Date.now() + apiRefreshTokenExpiresIn * 1000),
    refreshToken,
    tokenHash: hashApiRefreshToken(refreshToken),
  };
}

export async function rotateApiRefreshToken(token: string): Promise<ApiRefreshResult> {
  const tokenHash = hashApiRefreshToken(token);
  const storedToken = await withPrismaReadRetry(
    () => prisma.apiRefreshToken.findUnique({
      include: {
        externalApp: true,
        user: true,
      },
      where: {
        tokenHash,
      },
    }),
    { context: "api.auth.refresh.token" },
  );

  if (!storedToken) {
    return {
      ok: false,
      reason: "invalid-refresh-token",
    };
  }

  const now = new Date();

  if (storedToken.revokedAt) {
    if (storedToken.replacedByTokenId) {
      await prisma.apiRefreshToken.updateMany({
        data: {
          revokedAt: now,
        },
        where: {
          familyId: storedToken.familyId,
          revokedAt: null,
        },
      });

      return {
        ok: false,
        reason: "refresh-token-reused",
      };
    }

    return {
      ok: false,
      reason: "revoked-refresh-token",
    };
  }

  if (storedToken.expiresAt <= now) {
    return {
      ok: false,
      reason: "expired-refresh-token",
    };
  }

  if (!storedToken.user) {
    return {
      ok: false,
      reason: "user-not-found",
    };
  }

  if (storedToken.user.active === false) {
    return {
      ok: false,
      reason: "user-inactive",
    };
  }

  if (!storedToken.externalApp) {
    return {
      ok: false,
      reason: "app-not-found",
    };
  }

  if (storedToken.externalApp.active === false) {
    return {
      ok: false,
      reason: "app-inactive",
    };
  }

  const organization = await getApiUserOrganization(storedToken.user.id);

  if (!organization.ok) {
    return {
      ok: false,
      reason: organization.reason,
    };
  }

  if (storedToken.externalApp.organizationId !== organization.organizationId) {
    return {
      ok: false,
      reason: "app-organization-mismatch",
    };
  }

  const user = {
    email: storedToken.user.email,
    id: storedToken.user.id,
    name: storedToken.user.name,
  };
  const app = {
    clientId: storedToken.externalApp.clientId,
    id: storedToken.externalApp.id,
    name: storedToken.externalApp.name,
    slug: storedToken.externalApp.slug,
  };
  const pendingRefreshToken = buildApiRefreshTokenIssue();
  const rotation = await prisma.$transaction(async (tx) => {
    const revoked = await tx.apiRefreshToken.updateMany({
      data: {
        lastUsedAt: now,
        revokedAt: now,
      },
      where: {
        id: storedToken.id,
        replacedByTokenId: null,
        revokedAt: null,
      },
    });

    if (revoked.count !== 1) {
      await tx.apiRefreshToken.updateMany({
        data: {
          revokedAt: now,
        },
        where: {
          familyId: storedToken.familyId,
          revokedAt: null,
        },
      });

      return null;
    }

    const record = await tx.apiRefreshToken.create({
      data: {
        expiresAt: pendingRefreshToken.expiresAt,
        externalAppId: app.id,
        familyId: storedToken.familyId,
        tokenHash: pendingRefreshToken.tokenHash,
        userId: user.id,
      },
      select: {
        id: true,
      },
    });

    await tx.apiRefreshToken.update({
      data: {
        replacedByTokenId: record.id,
      },
      where: {
        id: storedToken.id,
      },
    });

    return record;
  });

  if (!rotation) {
    return {
      ok: false,
      reason: "refresh-token-reused",
    };
  }

  return {
    accessToken: await signApiAccessToken({ app, user }),
    app,
    issuedRefreshToken: {
      expiresAt: pendingRefreshToken.expiresAt,
      refreshToken: pendingRefreshToken.refreshToken,
      tokenId: rotation.id,
    },
    ok: true,
    user,
  };
}

export async function revokeApiRefreshToken(token: string) {
  const tokenHash = hashApiRefreshToken(token);

  await prisma.apiRefreshToken.updateMany({
    data: {
      revokedAt: new Date(),
    },
    where: {
      revokedAt: null,
      tokenHash,
    },
  });
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

  const user = await withPrismaReadRetry(
    () => prisma.user.findUnique({
      select: {
        active: true,
        email: true,
        id: true,
        name: true,
      },
      where: {
        id: verifiedToken.payload.sub,
      },
    }),
    { context: "api.auth.bearer.user" },
  );

  if (!user) {
    return {
      ok: false,
      reason: "user-not-found",
    };
  }

  if (user.active === false) {
    return {
      ok: false,
      reason: "user-inactive",
    };
  }

  const organization = await getApiUserOrganization(user.id);

  if (!organization.ok) {
    return {
      ok: false,
      reason: organization.reason,
    };
  }

  const app = await withPrismaReadRetry(
    () => prisma.externalApp.findUnique({
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
    }),
    { context: "api.auth.bearer.app" },
  );

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
    user: {
      email: user.email,
      id: user.id,
      name: user.name,
    },
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

    if (isDatabaseUnavailableError(error)) {
      return {
        ok: false,
        response: apiDatabaseUnavailableResponse(),
      };
    }

    throw error;
  }
}

export async function getApiOperationalContext(
  userId: string,
): Promise<ApiOperationalContextResult> {
  let memberships: ApiOperationalMembershipRow[];

  try {
    memberships = await withPrismaReadRetry(
      () => prisma.membership.findMany({
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
      }),
      { context: "api.context.memberships" },
    );
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return {
        ok: false,
        response: apiDatabaseUnavailableResponse(),
      };
    }

    throw error;
  }

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

  if (membership.organization.active === false) {
    return {
      ok: false,
      response: forbidden("Organizacion inactiva", "ORGANIZATION_INACTIVE"),
    };
  }

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

  try {
    const contract = await withPrismaReadRetry(
      () => prisma.contract.findFirst({
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
          organization: {
            active: true,
          },
          status: "ACTIVE",
        },
      }),
      { context: "api.contract.contract" },
    );

    if (!contract) {
      return {
        ok: false,
        response: notFound("Contrato no encontrado", "CONTRACT_NOT_FOUND"),
      };
    }

    const membership = await withPrismaReadRetry(
      () => prisma.membership.findUnique({
        select: {
          role: true,
        },
        where: {
          userId_organizationId: {
            organizationId: contract.organizationId,
            userId: userResult.user.id,
          },
        },
      }),
      { context: "api.contract.membership" },
    );

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
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return {
        ok: false,
        response: apiDatabaseUnavailableResponse(),
      };
    }

    throw error;
  }
}
