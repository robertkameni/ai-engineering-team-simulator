import "server-only";

import { cookies } from "next/headers";

const GUEST_SESSION_COOKIE_NAME = "team-sim-guest-session";

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

async function getSecretKey(): Promise<CryptoKey> {
  const secret = process.env.AUTH_SECRET?.trim() ?? "dev-auth-secret-change-me";
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signSessionId(id: string): Promise<string> {
  const key = await getSecretKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(id),
  );
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${id}.${hex}`;
}

async function verifySessionId(signed: string): Promise<string | null> {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) {
    return null;
  }

  const id = signed.slice(0, lastDot);
  const expected = await signSessionId(id);
  return expected === signed ? id : null;
}

function tryParseLegacySessionId(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.includes(".")) return null;
  return trimmed;
}

export async function getGuestSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(GUEST_SESSION_COOKIE_NAME)?.value?.trim();
  if (!value || value.length === 0) return null;

  if (value.includes(".")) {
    try {
      return await verifySessionId(value);
    } catch {
      console.warn("Guest session signature verification failed, ignoring cookie");
      return null;
    }
  }

  return tryParseLegacySessionId(value);
}

export async function getOrCreateGuestSessionId(): Promise<string> {
  const existing = await getGuestSessionId();
  if (existing) {
    return existing;
  }

  const guestSessionId = crypto.randomUUID();
  const signed = await signSessionId(guestSessionId);
  const cookieStore = await cookies();
  cookieStore.set(
    GUEST_SESSION_COOKIE_NAME,
    signed,
    guestSessionCookieOptions(signed),
  );

  return guestSessionId;
}
