import { NextResponse, type NextRequest } from "next/server";

import {
  authCookieDeletionHeader,
  getAuthCookieOptions,
  isSessionChunkCookieName,
  operationalCoreSessionCookieNames,
} from "@/lib/auth-cookies";
import {
  inspectSessionCookie,
  sessionCookieNamesToClear,
} from "@/lib/auth-session-recovery";
import {
  apiCorsPreflightResponse,
  applyApiCorsHeaders,
} from "@/lib/api-cors";
import { getAuthRouteDecision } from "@/lib/auth-route-policy";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api/v1/")) {
    if (request.method === "OPTIONS") {
      return apiCorsPreflightResponse(request);
    }

    const response = NextResponse.next();

    applyApiCorsHeaders(response.headers, request);

    return response;
  }

  const legacySessionChunks = request.cookies
    .getAll()
    .filter((cookie) =>
      isSessionChunkCookieName(cookie.name)
      && !operationalCoreSessionCookieNames.some((name) => cookie.name.startsWith(`${name}.`)),
    );

  if (legacySessionChunks.length > 0) {
    const response = NextResponse.redirect(request.nextUrl);

    for (const cookie of legacySessionChunks) {
      response.headers.append("Set-Cookie", authCookieDeletionHeader(cookie.name, "/"));
      response.headers.append("Set-Cookie", authCookieDeletionHeader(cookie.name, "/app"));
    }

    return response;
  }

  const sessionCookieName = getAuthCookieOptions().sessionToken.name;
  const sessionState = await inspectSessionCookie({
    cookieHeader: request.headers.get("cookie") ?? "",
    cookieName: sessionCookieName,
    secret: requiredAuthSecret(),
  });
  const hasSessionCookie = sessionState.kind === "valid";
  const decision = getAuthRouteDecision({
    hasSession: hasSessionCookie,
    pathname,
    search: request.nextUrl.search,
  });

  if (sessionState.kind === "invalid") {
    const destination = decision.kind === "redirect"
      ? new URL(decision.destination, request.url)
      : request.nextUrl;
    const response = NextResponse.redirect(destination);
    const names = sessionCookieNamesToClear(request.cookies.getAll().map((cookie) => cookie.name));

    for (const cookieName of names) {
      response.headers.append("Set-Cookie", authCookieDeletionHeader(cookieName, "/"));
      response.headers.append("Set-Cookie", authCookieDeletionHeader(cookieName, "/app"));
    }

    return response;
  }

  if (decision.kind === "redirect") {
    const loginUrl = new URL(decision.destination, request.url);

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/setup", "/app/:path*", "/api/v1/:path*"],
};

function requiredAuthSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret) throw new Error("AUTH_SECRET is required.");
  return secret;
}
