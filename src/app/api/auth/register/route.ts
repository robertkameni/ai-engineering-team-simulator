import { Prisma } from "@/generated/prisma/client";

import { authCredentialsSchema } from "@/lib/auth/auth-schemas";
import { assertAuthRateLimit } from "@/lib/auth/auth-rate-limit";
import {
  authServerErrorResponse,
  finalizeAuthenticatedUserSession,
  parseAuthRequestBody,
} from "@/lib/auth/auth-route-helpers";
import { hashPassword } from "@/lib/auth/password";
import { rateLimitResponse } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsedBody = await parseAuthRequestBody(request);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const parsed = authCredentialsSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return Response.json(
      { error: "Valid email and password (8+ characters) required" },
      { status: 400 },
    );
  }

  const email = parsed.data.email;

  const rateLimit = await assertAuthRateLimit(request, "auth_register", email);
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit);
  }

  const passwordHash = await hashPassword(parsed.data.password);

  try {
    const user = await prisma.user.create({
      data: { email, passwordHash },
    });

    return finalizeAuthenticatedUserSession(user);
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

    return authServerErrorResponse(
      error,
      "Register failed:",
      "Registration failed. Please try again.",
    );
  }
}
