import { decode, getToken, type JWT } from "@auth/core/jwt";
import { errors as joseErrors } from "jose";

import { operationalCoreSessionCookieNames } from "./auth-cookies";

type DecodeSessionToken = typeof decode;

export type SessionCookieState =
  | { kind: "none" }
  | { kind: "valid"; token: JWT }
  | { kind: "invalid" };

export async function inspectSessionCookie({
  cookieHeader,
  cookieName,
  decodeToken = decode,
  secret,
}: {
  cookieHeader: string;
  cookieName: string;
  decodeToken?: DecodeSessionToken;
  secret: string;
}): Promise<SessionCookieState> {
  const token = await getToken({
    cookieName,
    raw: true,
    req: { headers: new Headers({ cookie: cookieHeader }) },
  });

  if (!token) return { kind: "none" };

  try {
    const payload = await decodeToken({ salt: cookieName, secret, token });

    return payload ? { kind: "valid", token: payload } : { kind: "invalid" };
  } catch (error) {
    if (isExpectedInvalidSessionTokenError(error)) return { kind: "invalid" };
    throw error;
  }
}

export function isExpectedInvalidSessionTokenError(error: unknown) {
  return error instanceof joseErrors.JWTExpired
    || error instanceof joseErrors.JWEDecryptionFailed
    || error instanceof joseErrors.JWEInvalid
    || (error instanceof Error && error.message === "no matching decryption secret");
}

export function sessionCookieNamesToClear(cookieNames: string[]) {
  return cookieNames.filter((name) =>
    operationalCoreSessionCookieNames.some(
      (sessionName) => name === sessionName || name.startsWith(`${sessionName}.`),
    ),
  );
}
