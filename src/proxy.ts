import { NextResponse, type NextRequest } from "next/server";

import { operationalCoreSessionCookieNames } from "@/lib/auth-cookies";
import { getAuthRouteDecision } from "@/lib/auth-route-policy";

export function proxy(request: NextRequest) {
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
