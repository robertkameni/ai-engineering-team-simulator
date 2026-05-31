import type { RunOwnershipScope } from "@/lib/auth/run-ownership";
import type { RateLimitResult } from "@/lib/rate-limit-config";

export type DeleteRunActionResult =
  | { ok: true; deleted: true; shouldRedirect: boolean }
  | {
      ok: false;
      reason: "invalid_input" | "not_deleted" | "rate_limited";
      retryAfterSec?: number;
    };

export interface DeleteRunActionHooks {
  assertRateLimit: (
    request: Request,
    action: "delete",
    userId?: string | null,
  ) => Promise<RateLimitResult>;
  deleteRunIfOwned: (
    runId: string,
    scope: RunOwnershipScope,
  ) => Promise<"deleted" | "not_found" | "forbidden">;
}

export async function executeDeleteRunAction(
  runId: string | null | undefined,
  activePath: string | null | undefined,
  scope: RunOwnershipScope,
  request: Request,
  hooks: DeleteRunActionHooks,
): Promise<DeleteRunActionResult> {
  if (typeof runId !== "string" || runId.length === 0) {
    return { ok: false, reason: "invalid_input" };
  }

  const rateLimit = await hooks.assertRateLimit(
    request,
    "delete",
    scope.userId,
  );
  if (!rateLimit.ok) {
    return {
      ok: false,
      reason: "rate_limited",
      retryAfterSec: rateLimit.retryAfterSec,
    };
  }

  const deleteResult = await hooks.deleteRunIfOwned(runId, scope);
  if (deleteResult !== "deleted") {
    return { ok: false, reason: "not_deleted" };
  }

  const shouldRedirect =
    typeof activePath === "string" && activePath === `/runs/${runId}`;

  return { ok: true, deleted: true, shouldRedirect };
}
