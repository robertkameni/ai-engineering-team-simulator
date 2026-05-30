"use server";

import { revalidatePath } from "next/cache";

import { regenerateRunArtifactsWithUsage } from "@/lib/ai/persist-regenerate-usage";
import type { RegenerateArtifactsActionState } from "@/features/artifacts/regenerate-artifacts-state";
import {
  getRunOwnershipContext,
  requireRunAccess,
} from "@/lib/auth/run-ownership";

function mapRegenerateError(
  error:
    | "not_found"
    | "no_messages"
    | "run_in_progress"
    | "generation_active"
    | "generation_failed",
  message?: string,
): string {
  switch (error) {
    case "not_found":
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
    case "generation_failed":
      return message ?? "Artifact generation failed.";
    default:
      return "Artifact generation failed.";
  }
}

export async function regenerateRunArtifactsAction(
  _prevState: RegenerateArtifactsActionState,
  formData: FormData,
): Promise<RegenerateArtifactsActionState> {
  const runId = formData.get("runId");
  if (typeof runId !== "string" || runId.length === 0) {
    return { success: false, error: "Invalid run." };
  }

  const scope = await getRunOwnershipContext();
  const access = await requireRunAccess(runId, scope);
  if (!access.ok) {
    return {
      success: false,
      error: "Unauthorized access to this workspace.",
    };
  }

  const result = await regenerateRunArtifactsWithUsage(runId);
  if (!result.ok) {
    return {
      success: false,
      error: mapRegenerateError(result.error, result.message),
    };
  }

  revalidatePath(`/runs/${runId}`);
  return { success: true };
}
