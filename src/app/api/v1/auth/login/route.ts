import { z } from "zod";

import {
  apiAccessTokenExpiresIn,
  ApiAuthConfigurationError,
  apiDatabaseUnavailableResponse,
  apiRefreshTokenCookieHeader,
  getApiRefreshTokenTransport,
  issueApiRefreshToken,
  resolveApiLoginExternalApp,
  signApiAccessToken,
  verifyApiCredentials,
} from "@/lib/api-auth";
import { badRequest, internalError, success, unauthorized } from "@/lib/api-response";
import { isDatabaseUnavailableError } from "@/lib/prisma-resilience";

const loginSchema = z.object({
  clientId: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Body JSON invalido", "INVALID_JSON");
  }

  const parsedBody = loginSchema.safeParse(body);

  if (!parsedBody.success) {
    return badRequest("Credenciales invalidas", "INVALID_LOGIN_BODY");
  }

  const { clientId, ...credentials } = parsedBody.data;

  try {
    const user = await verifyApiCredentials(credentials);

    if (!user) {
      return unauthorized("Credenciales invalidas", "INVALID_CREDENTIALS");
    }

    const appResult = await resolveApiLoginExternalApp({
      clientId,
      userId: user.id,
    });

    if (!appResult.ok) {
      return appResult.response;
    }

    const accessToken = await signApiAccessToken({
      app: appResult.app,
      user,
    });
    const issuedRefreshToken = await issueApiRefreshToken({
      app: appResult.app,
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
      response.headers.append(
        "Set-Cookie",
        apiRefreshTokenCookieHeader(issuedRefreshToken.refreshToken),
      );
    }

    return response;
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
