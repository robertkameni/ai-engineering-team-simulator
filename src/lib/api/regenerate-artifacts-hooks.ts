import type { RegenerateRunArtifactsResult } from "@/ai/artifacts/regenerate-run-artifacts.types";
import type { RunOwnershipScope } from "@/lib/auth/run-ownership";
import type { RateLimitResult } from "@/lib/rate-limit-config";

/** Shared hooks for regenerate Server Action and POST /api/runs/[id]/artifacts. */
export interface RegenerateArtifactsAccessHooks {
  requireRunAccess: (
    runId: string,
    scope: RunOwnershipScope,
  ) => Promise<
    | { ok: true; run: { id: string; userId: string | null; guestSessionId: string | null; }; }
    | { ok: false; reason: "not_found" | "forbidden"; }
  >;
  assertRateLimit: (
    request: Request,
    action: "regenerate",
    userId?: string | null,
  ) => Promise<RateLimitResult>;
  regenerateRunArtifactsWithUsage: (
    runId: string,
    scope: RunOwnershipScope,
  ) => Promise<RegenerateRunArtifactsResult>;
}
