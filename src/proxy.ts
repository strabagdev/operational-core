import { NextResponse, type NextRequest } from "next/server";

import { operationalCoreSessionCookieNames } from "@/lib/auth-cookies";

export function proxy(request: NextRequest) {
  const hasSessionCookie = operationalCoreSessionCookieNames.some((name) =>
    request.cookies.has(name),
  );

  if (!hasSessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
