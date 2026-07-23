import "server-only";

import { getSessionUser } from "@/lib/auth/session";

export type AuthenticatedExportSession =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

export type AuthenticatedExportRoute =
  | { ok: true; id: string; userId: string }
  | { ok: false; response: Response };

/**
 * Shared auth gate for export routes (MD + PDF). Returns 401 when unsigned-in.
 */
export async function requireAuthenticatedExportSession(): Promise<AuthenticatedExportSession> {
  const { userId } = await getSessionUser();
  if (!userId) {
    return {
      ok: false,
      response: Response.json(
        { error: "Authentication required to export" },
        { status: 401 },
      ),
    };
  }

  return { ok: true, userId };
}

/** Auth + await `params.id` for saved-run export GET handlers. */
export async function resolveAuthenticatedExportRoute(
  params: Promise<{ id: string }>,
): Promise<AuthenticatedExportRoute> {
  const session = await requireAuthenticatedExportSession();
  if (!session.ok) {
    return session;
  }

  const { id } = await params;
  return { ok: true, id, userId: session.userId };
}
