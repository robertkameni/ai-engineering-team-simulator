import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const AUTH_SESSION_COOKIE_NAME = "team-sim-auth-session";

const AUTH_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface AuthSessionPayload {
  userId: string;
  email: string;
}

function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET is required in production");
    }
    return new TextEncoder().encode("dev-auth-secret-change-me");
  }
  return new TextEncoder().encode(secret);
}

function authCookieOptions(token: string) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
    value: token,
  };
}

export async function createAuthSessionToken(
  payload: AuthSessionPayload,
): Promise<string> {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${AUTH_SESSION_MAX_AGE_SECONDS}s`)
    .sign(getAuthSecret());
}

export async function verifyAuthSessionToken(
  token: string,
): Promise<AuthSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret(), {
      algorithms: ["HS256"],
    });
    const userId = payload.sub?.trim();
    const email =
      typeof payload.email === "string" ? payload.email.trim() : "";
    if (!userId || !email) {
      return null;
    }
    return { userId, email };
  } catch {
    return null;
  }
}

export async function setAuthSessionCookie(
  payload: AuthSessionPayload,
): Promise<void> {
  const token = await createAuthSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(
    AUTH_SESSION_COOKIE_NAME,
    token,
    authCookieOptions(token),
  );
}

export async function clearAuthSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_SESSION_COOKIE_NAME);
}

export async function readAuthSessionFromCookies(): Promise<AuthSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value?.trim();
  if (!token) {
    return null;
  }
  return verifyAuthSessionToken(token);
}
