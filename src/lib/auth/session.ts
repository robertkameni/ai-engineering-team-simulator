import "server-only";

export interface SessionUser {
  userId: string | null;
}

/**
 * Resolves the current session user. Returns null until auth is integrated (Phase 8).
 * In development, `x-dev-user-id` can simulate an authenticated user.
 */
export async function getSessionUser(): Promise<SessionUser> {
  if (process.env.NODE_ENV === "development") {
    const { headers } = await import("next/headers");
    const headerStore = await headers();
    const devUserId = headerStore.get("x-dev-user-id")?.trim();
    if (devUserId) {
      return { userId: devUserId };
    }
  }

  return { userId: null };
}
