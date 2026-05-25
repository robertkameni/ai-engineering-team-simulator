import { claimGuestRunsForUser } from "@/lib/auth/claim-guest-runs";
import { getGuestSessionId } from "@/lib/auth/guest-session";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  const { userId } = await getSessionUser();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guestSessionId = await getGuestSessionId();
  if (!guestSessionId) {
    return Response.json({ claimedCount: 0 });
  }

  const { claimedCount } = await claimGuestRunsForUser(userId, guestSessionId);

  return Response.json({ claimedCount });
}
