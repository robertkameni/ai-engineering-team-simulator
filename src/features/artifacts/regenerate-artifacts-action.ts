"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import {
  executeRegenerateArtifactsAction,
} from "@/features/artifacts/regenerate-artifacts-action-logic";
import type { RegenerateArtifactsActionState } from "@/features/artifacts/regenerate-artifacts-state";
import { regenerateRunArtifactsWithUsage } from "@/lib/ai/persist-regenerate-usage";
import {
  getRunOwnershipContext,
  requireRunAccess,
} from "@/lib/auth/run-ownership";
import { assertRateLimit } from "@/lib/rate-limit";

export async function regenerateRunArtifactsAction(
  _prevState: RegenerateArtifactsActionState,
  formData: FormData,
): Promise<RegenerateArtifactsActionState> {
  const runId = formData.get("runId");
  if (typeof runId !== "string" || runId.length === 0) {
    return { success: false, error: "Invalid run." };
  }

  const scope = await getRunOwnershipContext();
  const headerList = await headers();
  const request = new Request("http://internal.local/regenerate", {
    headers: headerList,
  });

  const result = await executeRegenerateArtifactsAction(
    runId,
    scope,
    request,
    {
      requireRunAccess,
      assertRateLimit,
      regenerateRunArtifactsWithUsage,
    },
  );

  if (result.success) {
    revalidatePath(`/runs/${runId}`);
  }

  return result;
}
