import { executeRegenerateArtifactsPost } from "@/lib/api/regenerate-artifacts-post-logic";
import { regenerateRunArtifactsWithUsage } from "@/lib/ai/persist-regenerate-usage";
import { requireRunAccess } from "@/lib/auth/run-ownership";
import type { RunOwnershipScope } from "@/lib/auth/run-ownership";
import { assertRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function handleRegenerateArtifactsPost(
  request: Request,
  runId: string,
  scope: RunOwnershipScope,
): Promise<Response> {
  return executeRegenerateArtifactsPost(request, runId, scope, {
    requireRunAccess,
    assertRateLimit,
    regenerateRunArtifactsWithUsage,
    rateLimitResponse,
  });
}
