import "server-only";

import { setAuthSessionCookie } from "@/lib/auth/auth-session";
import { claimGuestRunsForUser } from "@/lib/auth/claim-guest-runs";
import { getGuestSessionId } from "@/lib/auth/guest-session";

export type AuthRequestBodyResult =
  | { ok: true; body: unknown }
  | { ok: false; response: Response };

export async function parseAuthRequestBody(
  request: Request,
): Promise<AuthRequestBodyResult> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }
}

export async function finalizeAuthenticatedUserSession(user: {
  id: string;
  email: string;
}): Promise<Response> {
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

export function authServerErrorResponse(
  error: unknown,
  logMessage: string,
  fallbackMessage: string,
): Response {
  console.error(logMessage, error);

  if (error instanceof Error && error.message.includes("AUTH_SECRET")) {
    return Response.json(
      { error: "Server authentication is not configured (AUTH_SECRET)." },
      { status: 503 },
    );
  }

  return Response.json({ error: fallbackMessage }, { status: 500 });
}
