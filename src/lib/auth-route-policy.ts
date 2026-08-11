export type AuthRouteDecision =
  | { kind: "next" }
  | { kind: "redirect"; destination: string };

const authPathPrefixes = ["/api/auth"];
const publicAssetPrefixes = ["/_next/static", "/_next/image"];
const publicAssetPaths = ["/favicon.ico", "/manifest.json", "/sw.js"];

export function getAuthRouteDecision({
  hasSession,
  pathname,
  search = "",
}: {
  hasSession: boolean;
  pathname: string;
  search?: string;
}): AuthRouteDecision {
  if (isPublicInfrastructurePath(pathname)) {
    return { kind: "next" };
  }

  if (pathname === "/login") {
    return hasSession ? { kind: "redirect", destination: "/app" } : { kind: "next" };
  }

  if (pathname.startsWith("/app")) {
    if (hasSession) {
      return { kind: "next" };
    }

    const callbackUrl = `${pathname}${search}`;

    return {
      kind: "redirect",
      destination: `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`,
    };
  }

  return { kind: "next" };
}

export function isPublicInfrastructurePath(pathname: string) {
  return (
    authPathPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
    publicAssetPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
    publicAssetPaths.includes(pathname)
  );
}
