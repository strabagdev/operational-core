import { NextResponse, type NextRequest } from "next/server";

import {
  authCookieDeletionHeader,
  isSessionChunkCookieName,
  operationalCoreSessionCookieNames,
} from "@/lib/auth-cookies";
import { getAuthRouteDecision } from "@/lib/auth-route-policy";

export function proxy(request: NextRequest) {
  const staleSessionChunks = request.cookies
    .getAll()
    .filter((cookie) => isSessionChunkCookieName(cookie.name));

  if (staleSessionChunks.length > 0) {
    const response = NextResponse.redirect(request.nextUrl);

    for (const cookie of staleSessionChunks) {
      response.headers.append("Set-Cookie", authCookieDeletionHeader(cookie.name, "/"));
      response.headers.append("Set-Cookie", authCookieDeletionHeader(cookie.name, "/app"));
    }

    return response;
  }

  const hasSessionCookie = operationalCoreSessionCookieNames.some((name) =>
    request.cookies.has(name),
  );
  const decision = getAuthRouteDecision({
    hasSession: hasSessionCookie,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
  });

  if (decision.kind === "redirect") {
    const loginUrl = new URL(decision.destination, request.url);

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
