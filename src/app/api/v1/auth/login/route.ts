import { z } from "zod";

import {
  apiAccessTokenExpiresIn,
  ApiAuthConfigurationError,
  apiDatabaseUnavailableResponse,
  apiLoginSelectionChallengeCookieDeletionHeader,
  apiLoginSelectionChallengeCookieHeader,
  apiRefreshTokenCookieHeader,
  completeApiLoginSelection,
  extractApiLoginSelectionChallengeCookie,
  getApiRefreshTokenTransport,
  issueApiRefreshToken,
  requireApiRefreshCookieOrigin,
  resolveApiLoginOrganizationsForUser,
  resolveApiLoginExternalApp,
  signApiAccessToken,
  verifyApiCredentials,
  type ApiAuthenticatedApp,
  type ApiAuthenticatedUser,
} from "@/lib/api-auth";
import { badRequest, internalError, success, unauthorized } from "@/lib/api-response";
import { isDatabaseUnavailableError } from "@/lib/prisma-resilience";

const loginSchema = z.object({
  clientId: z.string().trim().min(1).optional(),
  email: z.string().trim().email(),
  password: z.string().min(1),
  preferredOrganizationId: z.string().trim().min(1).optional(),
});

const selectionSchema = z.object({
  challenge: z.string().trim().min(1),
  challengeNonce: z.string().trim().min(1).optional(),
  selectionId: z.string().trim().min(1),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Body JSON invalido", "INVALID_JSON");
  }

  const parsedSelectionBody = selectionSchema.safeParse(body);

  if (parsedSelectionBody.success) {
    try {
      const transport = getApiRefreshTokenTransport(request);
      const expectedNonce = transport === "web"
        ? extractApiLoginSelectionChallengeCookie(request)
        : parsedSelectionBody.data.challengeNonce ?? null;

      if (transport === "web") {
        const origin = requireApiRefreshCookieOrigin(request);

        if (!origin.ok) {
          return unauthorized("Credenciales invalidas", "LOGIN_SELECTION_INVALID");
        }
      }

      const selection = await completeApiLoginSelection({
        challenge: parsedSelectionBody.data.challenge,
        expectedNonce,
        selectionId: parsedSelectionBody.data.selectionId,
      });

      if (!selection.ok) {
        return unauthorized(
          "Credenciales invalidas",
          selection.reason === "expired-challenge"
            ? "LOGIN_SELECTION_EXPIRED"
            : "LOGIN_SELECTION_INVALID",
        );
      }

      return await issueLoginSessionResponse(request, selection.user, selection.app, {
        clearSelectionCookie: true,
      });
    } catch (error) {
      if (error instanceof ApiAuthConfigurationError) {
        return internalError(
          "Autenticacion API no configurada",
          "API_AUTH_SECRET_MISSING",
        );
      }

      if (isDatabaseUnavailableError(error)) {
        return apiDatabaseUnavailableResponse();
      }

      throw error;
    }
  }

  const parsedBody = loginSchema.safeParse(body);

  if (!parsedBody.success) {
    return badRequest("Credenciales invalidas", "INVALID_LOGIN_BODY");
  }

  const {
    clientId,
    preferredOrganizationId,
    ...credentials
  } = parsedBody.data;

  try {
    const user = await verifyApiCredentials(credentials);

    if (!user) {
      return unauthorized("Credenciales invalidas", "INVALID_CREDENTIALS");
    }

    if (clientId) {
      const appResult = await resolveApiLoginExternalApp({
        clientId,
        userId: user.id,
      });

      if (!appResult.ok) {
        return appResult.response;
      }

      return await issueLoginSessionResponse(request, user, appResult.app);
    }

    const loginTarget = await resolveApiLoginOrganizationsForUser({
      preferredOrganizationId,
      userId: user.id,
    });

    if (loginTarget.ok === false) {
      return unauthorized("Credenciales invalidas", "INVALID_CREDENTIALS");
    }

    if (loginTarget.ok === "selection-required") {
      const isNative = getApiRefreshTokenTransport(request) === "native";
      const response = success({
        challenge: loginTarget.challenge.challenge,
        expiresIn: loginTarget.challenge.expiresIn,
        ...(isNative ? { challengeNonce: loginTarget.challenge.nonce } : {}),
        organizations: loginTarget.challenge.options,
        ...(loginTarget.challenge.preferredSelectionId
          ? { preferredSelectionId: loginTarget.challenge.preferredSelectionId }
          : {}),
        status: "selection_required",
      });

      if (!isNative) {
        response.headers.append(
          "Set-Cookie",
          apiLoginSelectionChallengeCookieHeader(loginTarget.challenge.nonce),
        );
      }

      return response;
    }

    return await issueLoginSessionResponse(request, user, loginTarget.app);
  } catch (error) {
    if (error instanceof ApiAuthConfigurationError) {
      return internalError(
        "Autenticacion API no configurada",
        "API_AUTH_SECRET_MISSING",
      );
    }

    if (isDatabaseUnavailableError(error)) {
      return apiDatabaseUnavailableResponse();
    }

    throw error;
  }
}

async function issueLoginSessionResponse(
  request: Request,
  user: ApiAuthenticatedUser,
  app: ApiAuthenticatedApp,
  options: { clearSelectionCookie?: boolean } = {},
) {
  const accessToken = await signApiAccessToken({
    app,
    user,
  });
  const issuedRefreshToken = await issueApiRefreshToken({
    app,
    user,
  });
  const isNative = getApiRefreshTokenTransport(request) === "native";
  const response = success({
    accessToken,
    expiresIn: apiAccessTokenExpiresIn,
    ...(isNative ? { refreshToken: issuedRefreshToken.refreshToken } : {}),
    tokenType: "Bearer",
  });

  if (!isNative) {
    if (options.clearSelectionCookie) {
      response.headers.append(
        "Set-Cookie",
        apiLoginSelectionChallengeCookieDeletionHeader(),
      );
    }

    response.headers.append(
      "Set-Cookie",
      apiRefreshTokenCookieHeader(issuedRefreshToken.refreshToken),
    );
  }

  return response;
}
