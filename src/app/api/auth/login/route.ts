import { setAuthSessionCookie } from "@/lib/auth/auth-session";
import { authCredentialsSchema } from "@/lib/auth/auth-schemas";
import { claimGuestRunsForUser } from "@/lib/auth/claim-guest-runs";
import { getGuestSessionId } from "@/lib/auth/guest-session";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = authCredentialsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid email or password" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }

  await setAuthSessionCookie({ userId: user.id, email: user.email });

  const guestSessionId = await getGuestSessionId();
  if (guestSessionId) {
    await claimGuestRunsForUser(user.id, guestSessionId);
  }

  return Response.json({
    userId: user.id,
    email: user.email,
  });
}
