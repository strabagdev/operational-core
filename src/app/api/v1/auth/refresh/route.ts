import { z } from "zod";

import {
  apiAccessTokenExpiresIn,
  ApiAuthConfigurationError,
  apiRefreshFailureResponse,
  apiRefreshTokenCookieHeader,
  extractApiRefreshTokenCookie,
  getApiRefreshTokenTransport,
  requireApiRefreshCookieOrigin,
  rotateApiRefreshToken,
} from "@/lib/api-auth";
import { badRequest, internalError, success } from "@/lib/api-response";

const nativeRefreshSchema = z.object({
  refreshToken: z.string().trim().min(1),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const transport = getApiRefreshTokenTransport(request);
  let refreshToken: string | null = null;

  if (transport === "native") {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return badRequest("Body JSON invalido", "INVALID_JSON");
    }

    const parsedBody = nativeRefreshSchema.safeParse(body);

    if (!parsedBody.success) {
      return badRequest("Refresh token invalido", "INVALID_REFRESH_BODY");
    }

    refreshToken = parsedBody.data.refreshToken;
  } else {
    const origin = requireApiRefreshCookieOrigin(request);

    if (!origin.ok) {
      return apiRefreshFailureResponse(origin.reason);
    }

    refreshToken = extractApiRefreshTokenCookie(request);
  }

  if (!refreshToken) {
    return apiRefreshFailureResponse("missing-refresh-token");
  }

  try {
    const result = await rotateApiRefreshToken(refreshToken);

    if (!result.ok) {
      return apiRefreshFailureResponse(result.reason);
    }

    const response = success({
      accessToken: result.accessToken,
      expiresIn: apiAccessTokenExpiresIn,
      ...(transport === "native"
        ? { refreshToken: result.issuedRefreshToken.refreshToken }
        : {}),
      tokenType: "Bearer",
    });

    if (transport === "web") {
      response.headers.append(
        "Set-Cookie",
        apiRefreshTokenCookieHeader(result.issuedRefreshToken.refreshToken),
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

    throw error;
  }
}
