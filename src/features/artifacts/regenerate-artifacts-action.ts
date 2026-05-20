"use server";

import { revalidatePath } from "next/cache";

import { regenerateRunArtifacts } from "@/ai/artifacts/regenerate-run-artifacts";

export async function regenerateRunArtifactsAction(formData: FormData) {
  const runId = formData.get("runId");
  if (typeof runId !== "string" || runId.length === 0) {
    return;
  }

  const result = await regenerateRunArtifacts(runId);
  if (!result.ok) {
    return;
  }

  revalidatePath(`/runs/${runId}`);
}
