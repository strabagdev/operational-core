import {
  authCookieDeletionHeader,
  authCookieNamesToClear,
} from "@/lib/auth-cookies";

export const runtime = "nodejs";

export async function POST() {
  const response = new Response(null, {
    headers: { Location: "/login" },
    status: 303,
  });

  for (const cookieName of authCookieNamesToClear) {
    response.headers.append("Set-Cookie", authCookieDeletionHeader(cookieName));
  }

  return response;
}
