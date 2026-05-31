import { Prisma } from "@/generated/prisma/client";

import { setAuthSessionCookie } from "@/lib/auth/auth-session";
import { authCredentialsSchema } from "@/lib/auth/auth-schemas";
import { claimGuestRunsForUser } from "@/lib/auth/claim-guest-runs";
import { getGuestSessionId } from "@/lib/auth/guest-session";
import { assertAuthRateLimit } from "@/lib/auth/auth-rate-limit";
import { hashPassword } from "@/lib/auth/password";
import { rateLimitResponse } from "@/lib/rate-limit";
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
    return Response.json(
      { error: "Valid email and password (8+ characters) required" },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();

  const rateLimit = await assertAuthRateLimit(request, "auth_register", email);
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit);
  }

  const passwordHash = await hashPassword(parsed.data.password);

  try {
    const user = await prisma.user.create({
      data: { email, passwordHash },
    });

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
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      console.warn("Register rejected: duplicate email", { email });
      return Response.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    console.error("Register failed:", error);

    if (error instanceof Error && error.message.includes("AUTH_SECRET")) {
      return Response.json(
        { error: "Server authentication is not configured (AUTH_SECRET)." },
        { status: 503 },
      );
    }

    return Response.json(
      { error: "Registration failed. Please try again." },
      { status: 500 },
    );
  }
}
