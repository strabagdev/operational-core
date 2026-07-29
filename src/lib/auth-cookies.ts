const authCookiePrefix = "operational-core";

export const operationalCoreSessionCookieNames = [
  `${authCookiePrefix}.session-token`,
  `__Secure-${authCookiePrefix}.session-token`,
] as const;

export function getAuthCookieOptions() {
  const secure = process.env.AUTH_URL
    ? process.env.AUTH_URL.startsWith("https://")
    : process.env.NODE_ENV === "production";

  return {
    sessionToken: {
      name: secure
        ? operationalCoreSessionCookieNames[1]
        : operationalCoreSessionCookieNames[0],
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure,
      },
    },
    callbackUrl: {
      name: secure
        ? `__Secure-${authCookiePrefix}.callback-url`
        : `${authCookiePrefix}.callback-url`,
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure,
      },
    },
    csrfToken: {
      name: secure
        ? `__Host-${authCookiePrefix}.csrf-token`
        : `${authCookiePrefix}.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure,
      },
    },
  };
}
