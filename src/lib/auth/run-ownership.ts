import "server-only";

import { getGuestSessionId } from "@/lib/auth/guest-session";
import { getSessionUser } from "@/lib/auth/session";
import { canAccessRun } from "@/lib/db/runs";
import { prisma } from "@/lib/prisma";

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

export type RequireRunAccessResult =
  | {
      ok: true;
      run: {
        id: string;
        userId: string | null;
        guestSessionId: string | null;
      };
    }
  | { ok: false; reason: "not_found" | "forbidden" };

export async function requireRunAccess(
  runId: string,
  scope: RunOwnershipScope,
): Promise<RequireRunAccessResult> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: { id: true, userId: true, guestSessionId: true },
  });

  if (!run) {
    return { ok: false, reason: "not_found" };
  }

  if (!canAccessRun(run, scope)) {
    return { ok: false, reason: "forbidden" };
  }

  return { ok: true, run };
}

