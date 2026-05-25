import {
  clearAuthSessionCookie,
} from "@/lib/auth/auth-session";
import { clearGuestSessionCookie } from "@/lib/auth/guest-session";

export const runtime = "nodejs";

export async function POST() {
  await clearAuthSessionCookie();
  await clearGuestSessionCookie();

  return Response.json({ ok: true });
}
