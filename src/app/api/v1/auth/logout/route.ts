import { z } from "zod";

import {
  ApiAuthConfigurationError,
  apiRefreshFailureResponse,
  apiRefreshTokenCookieDeletionHeader,
  extractApiRefreshTokenCookie,
  getApiRefreshTokenTransport,
  requireApiRefreshCookieOrigin,
  revokeApiRefreshToken,
} from "@/lib/api-auth";
import { badRequest, internalError, success } from "@/lib/api-response";

const nativeLogoutSchema = z.object({
  refreshToken: z.string().trim().min(1).optional(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const transport = getApiRefreshTokenTransport(request);
  let refreshToken: string | null = null;

  if (transport === "native") {
    let body: unknown = {};

    try {
      const text = await request.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      return badRequest("Body JSON invalido", "INVALID_JSON");
    }

    const parsedBody = nativeLogoutSchema.safeParse(body);

    if (!parsedBody.success) {
      return badRequest("Logout invalido", "INVALID_LOGOUT_BODY");
    }

    refreshToken = parsedBody.data.refreshToken ?? null;
  } else {
    const origin = requireApiRefreshCookieOrigin(request);

    if (!origin.ok) {
      return apiRefreshFailureResponse(origin.reason);
    }

    refreshToken = extractApiRefreshTokenCookie(request);
  }

  try {
    if (refreshToken) {
      await revokeApiRefreshToken(refreshToken);
    }

    const response = success({ revoked: true });

    if (transport === "web") {
      response.headers.append("Set-Cookie", apiRefreshTokenCookieDeletionHeader());
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
