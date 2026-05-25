import "server-only";

import { getGuestSessionId } from "@/lib/auth/guest-session";
import { getSessionUser } from "@/lib/auth/session";

export interface RunOwnershipScope {
  userId: string | null;
  guestSessionId: string | null;
}

/** Read-only ownership context; does not create a guest cookie. */
export async function getRunOwnershipContext(): Promise<RunOwnershipScope> {
  const [{ userId }, guestSessionId] = await Promise.all([
    getSessionUser(),
    getGuestSessionId(),
  ]);

  return { userId, guestSessionId };
}

/** Route Handlers and Server Actions only — cannot set cookies from RSC pages. */
export async function getRunOwnershipContextWithGuestSession(): Promise<RunOwnershipScope> {
  const { getOrCreateGuestSessionId } = await import("@/lib/auth/guest-session");
  const [{ userId }, guestSessionId] = await Promise.all([
    getSessionUser(),
    getOrCreateGuestSessionId(),
  ]);

  return { userId, guestSessionId };
}
