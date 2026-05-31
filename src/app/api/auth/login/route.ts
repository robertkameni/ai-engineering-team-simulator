import { setAuthSessionCookie } from "@/lib/auth/auth-session";
import { authCredentialsSchema } from "@/lib/auth/auth-schemas";
import { claimGuestRunsForUser } from "@/lib/auth/claim-guest-runs";
import { getGuestSessionId } from "@/lib/auth/guest-session";
import { assertAuthRateLimit } from "@/lib/auth/auth-rate-limit";
import { verifyPassword } from "@/lib/auth/password";
import { rateLimitResponse } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function loginErrorResponse(error: unknown): Response {
  console.error("Login failed:", error);

  if (error instanceof Error) {
    if (error.message.includes("AUTH_SECRET")) {
      return Response.json(
        { error: "Server authentication is not configured (AUTH_SECRET)." },
        { status: 503 },
      );
    }
  }

  return Response.json({ error: "Login failed. Please try again." }, { status: 500 });
}

export async function POST(request: Request) {
  try {
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

    const rateLimit = await assertAuthRateLimit(request, "auth_login", email);
    if (!rateLimit.ok) {
      return rateLimitResponse(rateLimit);
    }

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
  } catch (error) {
    return loginErrorResponse(error);
  }
}
