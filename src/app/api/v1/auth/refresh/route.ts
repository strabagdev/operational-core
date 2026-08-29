import { z } from "zod";

import {
  apiAccessTokenExpiresIn,
  ApiAuthConfigurationError,
  apiDatabaseUnavailableResponse,
  apiRefreshFailureResponse,
  apiRefreshTokenCookieHeader,
  extractApiRefreshTokenCookie,
  getApiRefreshTokenTransport,
  requireApiRefreshCookieOrigin,
  rotateApiRefreshToken,
} from "@/lib/api-auth";
import { applyApiDiagnosticsHeaders, createApiServerTiming } from "@/lib/api-diagnostics";
import { badRequest, internalError, success } from "@/lib/api-response";
import { isDatabaseUnavailableError } from "@/lib/prisma-resilience";

const nativeRefreshSchema = z.object({
  refreshToken: z.string().trim().min(1),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const timing = createApiServerTiming("api auth refresh timing");
  const transport = getApiRefreshTokenTransport(request);
  timing.mark("request_parse");
  let refreshToken: string | null = null;

  if (transport === "native") {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      const response = badRequest("Body JSON invalido", "INVALID_JSON");

      return applyApiDiagnosticsHeaders(response, request, timing.finish("invalid_json", response.status));
    }

    const parsedBody = nativeRefreshSchema.safeParse(body);
    timing.mark("token_lookup");

    if (!parsedBody.success) {
      const response = badRequest("Refresh token invalido", "INVALID_REFRESH_BODY");

      return applyApiDiagnosticsHeaders(response, request, timing.finish("invalid_body", response.status));
    }

    refreshToken = parsedBody.data.refreshToken;
  } else {
    const origin = requireApiRefreshCookieOrigin(request);
    timing.mark("token_lookup");

    if (!origin.ok) {
      const response = apiRefreshFailureResponse(origin.reason);

      return applyApiDiagnosticsHeaders(response, request, timing.finish("origin_error", response.status));
    }

    refreshToken = extractApiRefreshTokenCookie(request);
  }

  if (!refreshToken) {
    const response = apiRefreshFailureResponse("missing-refresh-token");

    return applyApiDiagnosticsHeaders(response, request, timing.finish("missing_token", response.status));
  }

  try {
    timing.mark("token_validation");
    const result = await rotateApiRefreshToken(refreshToken);
    timing.mark("token_rotation");

    if (!result.ok) {
      const response = apiRefreshFailureResponse(result.reason);

      return applyApiDiagnosticsHeaders(response, request, timing.finish("refresh_error", response.status));
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

    timing.mark("response_generation");
    return applyApiDiagnosticsHeaders(response, request, timing.finish("ok", response.status));
  } catch (error) {
    if (error instanceof ApiAuthConfigurationError) {
      const response = internalError(
        "Autenticacion API no configurada",
        "API_AUTH_SECRET_MISSING",
      );

      return applyApiDiagnosticsHeaders(response, request, timing.finish("configuration_error", response.status));
    }

    if (isDatabaseUnavailableError(error)) {
      const response = apiDatabaseUnavailableResponse();

      return applyApiDiagnosticsHeaders(response, request, timing.finish("db_unavailable", response.status));
    }

    timing.finish("thrown");
    throw error;
  }
}
