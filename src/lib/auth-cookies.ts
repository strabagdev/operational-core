const authCookiePrefix = "operational-core";

export const operationalCoreSessionCookieNames = [
  `${authCookiePrefix}.session-token`,
  `__Secure-${authCookiePrefix}.session-token`,
] as const;

export const operationalCoreCallbackCookieNames = [
  `${authCookiePrefix}.callback-url`,
  `__Secure-${authCookiePrefix}.callback-url`,
] as const;

export const operationalCoreCsrfCookieNames = [
  `${authCookiePrefix}.csrf-token`,
  `__Host-${authCookiePrefix}.csrf-token`,
] as const;

export const operationalCoreAuthCookieNames = [
  ...operationalCoreSessionCookieNames,
  ...operationalCoreCallbackCookieNames,
  ...operationalCoreCsrfCookieNames,
] as const;

type AuthCookieEnv = {
  AUTH_URL?: string;
  NODE_ENV?: string;
};

export function isSecureAuthCookieEnvironment(env: AuthCookieEnv = process.env) {
  return env.AUTH_URL
    ? env.AUTH_URL.startsWith("https://")
    : env.NODE_ENV === "production";
}

export function getAuthCookieOptions(env: AuthCookieEnv = process.env) {
  const secure = isSecureAuthCookieEnvironment(env);

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
        ? operationalCoreCallbackCookieNames[1]
        : operationalCoreCallbackCookieNames[0],
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure,
      },
    },
    csrfToken: {
      name: secure
        ? operationalCoreCsrfCookieNames[1]
        : operationalCoreCsrfCookieNames[0],
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure,
      },
    },
  };
}

export function authCookieDeletionOptions(name: string) {
  const secure = name.startsWith("__Secure-") || name.startsWith("__Host-");

  return {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax" as const,
    secure,
  };
}

type MutableCookieStore = {
  set: (name: string, value: string, options: ReturnType<typeof authCookieDeletionOptions>) => void;
};

export function clearOperationalCoreAuthCookies(cookieStore: MutableCookieStore) {
  for (const cookieName of operationalCoreAuthCookieNames) {
    cookieStore.set(cookieName, "", authCookieDeletionOptions(cookieName));
  }
}
