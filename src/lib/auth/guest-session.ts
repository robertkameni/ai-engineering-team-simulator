import "server-only";

import { cookies } from "next/headers";

export const GUEST_SESSION_COOKIE_NAME = "team-sim-guest-session";

const GUEST_SESSION_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

function guestSessionCookieOptions(value: string) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: GUEST_SESSION_MAX_AGE_SECONDS,
    value,
  };
}

export async function getGuestSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(GUEST_SESSION_COOKIE_NAME)?.value?.trim();
  return value && value.length > 0 ? value : null;
}

export async function getOrCreateGuestSessionId(): Promise<string> {
  const existing = await getGuestSessionId();
  if (existing) {
    return existing;
  }

  const guestSessionId = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(
    GUEST_SESSION_COOKIE_NAME,
    guestSessionId,
    guestSessionCookieOptions(guestSessionId),
  );

  return guestSessionId;
}

export async function clearGuestSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(GUEST_SESSION_COOKIE_NAME);
}
