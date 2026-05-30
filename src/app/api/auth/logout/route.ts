import { clearAuthSessionCookie, readAuthSessionFromCookies } from "@/lib/auth/auth-session";
import { logoutBodySchema } from "@/lib/auth/auth-schemas";
import { releaseRunToGuestSession } from "@/lib/auth/claim-guest-runs";
import { getOrCreateGuestSessionId } from "@/lib/auth/guest-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await readAuthSessionFromCookies();
  const userId = session?.userId ?? null;

  let runId: string | undefined;
  try {
    const body: unknown = await request.json();
    const parsed = logoutBodySchema.safeParse(body);
    if (parsed.success) {
      runId = parsed.data.runId;
    }
  } catch {
    // Empty body is valid for logout without releasing a run.
  }

  await clearAuthSessionCookie();
  const guestSessionId = await getOrCreateGuestSessionId();

  if (userId && runId) {
    await releaseRunToGuestSession(userId, runId, guestSessionId);
  }

  return Response.json({ ok: true });
}
