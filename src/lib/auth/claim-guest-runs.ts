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
