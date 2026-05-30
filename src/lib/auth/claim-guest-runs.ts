import "server-only";

import { prisma } from "@/lib/prisma";

export interface ClaimGuestRunsResult {
  claimedCount: number;
}

export async function claimGuestRunsForUser(
  userId: string,
  guestSessionId: string,
): Promise<ClaimGuestRunsResult> {
  const trimmedUserId = userId.trim();
  const trimmedGuestSessionId = guestSessionId.trim();

  if (!trimmedUserId || !trimmedGuestSessionId) {
    return { claimedCount: 0 };
  }

  const result = await prisma.run.updateMany({
    where: {
      guestSessionId: trimmedGuestSessionId,
      userId: null,
    },
    data: {
      userId: trimmedUserId,
      guestSessionId: null,
    },
  });

  return { claimedCount: result.count };
}

export interface ReleaseRunToGuestSessionResult {
  released: boolean;
}

/** Moves one user-owned run back to a guest session (inverse of claim). */
export async function releaseRunToGuestSession(
  userId: string,
  runId: string,
  guestSessionId: string,
): Promise<ReleaseRunToGuestSessionResult> {
  const trimmedUserId = userId.trim();
  const trimmedRunId = runId.trim();
  const trimmedGuestSessionId = guestSessionId.trim();

  if (!trimmedUserId || !trimmedRunId || !trimmedGuestSessionId) {
    return { released: false };
  }

  const result = await prisma.run.updateMany({
    where: {
      id: trimmedRunId,
      userId: trimmedUserId,
    },
    data: {
      userId: null,
      guestSessionId: trimmedGuestSessionId,
    },
  });

  return { released: result.count > 0 };
}
