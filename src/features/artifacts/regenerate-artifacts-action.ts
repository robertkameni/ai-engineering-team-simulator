"use server";

import { revalidatePath } from "next/cache";

import { regenerateRunArtifacts } from "@/ai/artifacts/regenerate-run-artifacts";

export type RegenerateArtifactsActionState = {
  success: boolean;
  error?: string;
};

const INITIAL_STATE: RegenerateArtifactsActionState = { success: false };

function mapRegenerateError(
  error: "not_found" | "no_messages" | "run_in_progress" | "generation_failed",
  message?: string,
): string {
  switch (error) {
    case "not_found":
      return "Run not found.";
    case "no_messages":
      return "No debate messages to synthesize from.";
    case "run_in_progress":
      return "Run still in progress. Wait for the debate to finish.";
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

  const result = await regenerateRunArtifacts(runId);
  if (!result.ok) {
    return {
      success: false,
      error: mapRegenerateError(result.error, result.message),
    };
  }

  revalidatePath(`/runs/${runId}`);
  return { success: true };
}

export { INITIAL_STATE as regenerateArtifactsInitialState };
