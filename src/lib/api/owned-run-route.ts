import "server-only";

import {
  getRunOwnershipContext,
  type RunOwnershipScope,
} from "@/lib/auth/run-ownership";

export type OwnedRunRouteParams = {
  params: Promise<{ id: string }>;
};

export type ResolvedOwnedRunRoute = {
  readonly id: string;
  readonly scope: RunOwnershipScope;
};

/** Await dynamic `id` + ownership scope for owned-run GET/DELETE handlers. */
export async function resolveOwnedRunRoute(
  params: Promise<{ id: string }>,
): Promise<ResolvedOwnedRunRoute> {
  const { id } = await params;
  const scope = await getRunOwnershipContext();
  return { id, scope };
}

/** IDOR-safe 404 mask for missing or forbidden runs. */
export function runNotFoundResponse(): Response {
  return Response.json({ error: "Run not found" }, { status: 404 });
}

export type OwnedRunLoadResult<T> =
  | { ok: true; data: T; id: string; scope: RunOwnershipScope }
  | { ok: false; response: Response };

/**
 * Resolve ownership, load a scoped resource, and mask misses as 404.
 */
export async function loadOwnedRunResource<T>(
  params: Promise<{ id: string }>,
  loader: (id: string, scope: RunOwnershipScope) => Promise<T | null>,
): Promise<OwnedRunLoadResult<T>> {
  const { id, scope } = await resolveOwnedRunRoute(params);
  const data = await loader(id, scope);
  if (data == null) {
    return { ok: false, response: runNotFoundResponse() };
  }
  return { ok: true, data, id, scope };
}
