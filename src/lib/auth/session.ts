import "server-only";

import { cache } from "react";

import { readAuthSessionFromCookies } from "@/lib/auth/auth-session";

export interface SessionUser {
  userId: string | null;
  email: string | null;
}

/** Request-scoped; React.cache dedupes across RSC tree (arch-review F9). */
export const getSessionUser = cache(async (): Promise<SessionUser> => {
  const session = await readAuthSessionFromCookies();
  if (session) {
    return { userId: session.userId, email: session.email };
  }

  return { userId: null, email: null };
});
