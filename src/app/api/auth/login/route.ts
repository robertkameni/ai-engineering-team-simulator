import { authCredentialsSchema } from "@/lib/auth/auth-schemas";
import { assertAuthRateLimit } from "@/lib/auth/auth-rate-limit";
import {
  authServerErrorResponse,
  finalizeAuthenticatedUserSession,
  parseAuthRequestBody,
} from "@/lib/auth/auth-route-helpers";
import { verifyPassword } from "@/lib/auth/password";
import { rateLimitResponse } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const parsedBody = await parseAuthRequestBody(request);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    const parsed = authCredentialsSchema.safeParse(parsedBody.body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid email or password" }, { status: 400 });
    }

    const email = parsed.data.email;

    const rateLimit = await assertAuthRateLimit(request, "auth_login", email);
    if (!rateLimit.ok) {
      return rateLimitResponse(rateLimit);
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return Response.json({ error: "Invalid email or password" }, { status: 401 });
    }

    return finalizeAuthenticatedUserSession(user);
  } catch (error) {
    return authServerErrorResponse(
      error,
      "Login failed:",
      "Login failed. Please try again.",
    );
  }
}
