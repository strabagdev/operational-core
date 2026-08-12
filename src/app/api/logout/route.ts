import { NextResponse } from "next/server";

import {
  authCookieNamesToClear,
  authCookieDeletionOptions,
} from "@/lib/auth-cookies";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });

  for (const cookieName of authCookieNamesToClear) {
    response.cookies.set(cookieName, "", authCookieDeletionOptions(cookieName));
  }

  return response;
}
