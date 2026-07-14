import type { RegenerateRunArtifactsError } from "@/ai/artifacts/regenerate-run-artifacts.types";
import type { RunOwnershipScope } from "@/lib/auth/run-ownership";
import type { RegenerateArtifactsActionState } from "@/features/artifacts/regenerate-artifacts-state";

import type { RegenerateArtifactsActionHooks } from "@/features/artifacts/regenerate-artifacts-action-logic.types";

function mapRegenerateActionError(
  error: RegenerateRunArtifactsError,
  message?: string,
): string {
  switch (error) {
    case "not_found":
    case "forbidden":
      return "Run not found.";
    case "no_messages":
      return "No debate messages to synthesize from.";
    case "run_in_progress":
      return "Run still in progress. Wait for the debate to finish.";
    case "generation_active":
      return (
        message ??
        "A generation process is already active for this workspace."
      );
    case "budget_exceeded":
      return "This run reached the simulation cost limit. Debate results are saved; artifacts could not be generated.";
    case "generation_failed":
      return message ?? "Artifact generation failed.";
    default:
      return "Artifact generation failed.";
  }
}

export function formatRateLimitActionError(retryAfterSec: number): string {
  return `Rate limit exceeded. Try again in ${retryAfterSec} second${retryAfterSec === 1 ? "" : "s"}.`;
}

export async function executeRegenerateArtifactsAction(
  runId: string,
  scope: RunOwnershipScope,
  request: Request,
  hooks: RegenerateArtifactsActionHooks,
): Promise<RegenerateArtifactsActionState> {
  const access = await hooks.requireRunAccess(runId, scope);
  if (!access.ok) {
    return {
      success: false,
      error: "Run not found.",
    };
  }

  const rateLimit = await hooks.assertRateLimit(
    request,
    "regenerate",
    scope.userId,
  );
  if (!rateLimit.ok) {
    return {
      success: false,
      error: formatRateLimitActionError(rateLimit.retryAfterSec),
    };
  }

  const result = await hooks.regenerateRunArtifactsWithUsage(runId, scope);
  if (!result.ok) {
    return {
      success: false,
      error: mapRegenerateActionError(result.error, result.message),
    };
  }

  return { success: true };
}
