import "server-only";

import { readAuthSessionFromCookies } from "@/lib/auth/auth-session";

export interface SessionUser {
  userId: string | null;
  email: string | null;
}

export async function getSessionUser(): Promise<SessionUser> {
  const session = await readAuthSessionFromCookies();
  if (session) {
    return { userId: session.userId, email: session.email };
  }

  return { userId: null, email: null };
}
