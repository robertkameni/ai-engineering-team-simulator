import "server-only";

import { regenerateRunArtifacts } from "@/ai/artifacts/regenerate-run-artifacts";
import { CORE_ARTIFACT_TYPES } from "@/features/artifacts/artifact-constants";
import {
  createRunUsageAccumulator,
  type RunUsageAccumulator,
} from "@/lib/ai/run-usage-accumulator";
import type { RunOwnershipScope } from "@/lib/auth/run-ownership";
import { reconcileRunFailure } from "@/lib/db/run-reconcile";
import { getRunUsageTotalsById, setRunUsageTotals, updateRunStatus } from "@/lib/db/runs";
import { resolveRequestOrigin } from "@/lib/http/resolve-request-origin";

export async function scheduleCoreArtifactSynthesis({
  runId,
  scope,
  usageAccumulator,
}: {
  runId: string;
  scope: RunOwnershipScope;
  usageAccumulator?: RunUsageAccumulator;
}): Promise<void> {
  const accumulator =
    usageAccumulator ??
    createRunUsageAccumulator(await getRunUsageTotalsById(runId));

  const synthesis = await regenerateRunArtifacts(runId, {
    scope,
    usageAccumulator: accumulator,
    artifactTypes: CORE_ARTIFACT_TYPES,
  });

  await setRunUsageTotals(runId, accumulator.getTotals());

  if (synthesis.ok) {
    await updateRunStatus(runId, "complete");
    return;
  }

  if (synthesis.error === "budget_exceeded") {
    console.warn("Background artifact synthesis stopped: budget exceeded", { runId });
    await reconcileRunFailure(runId, {
      debateComplete: true,
      artifactPhaseStarted: true,
    });
    await updateRunStatus(runId, "failed");
    return;
  }

  if (
    synthesis.error === "generation_active" ||
    synthesis.error === "run_in_progress"
  ) {
    return;
  }

  console.error("Background artifact synthesis failed", { runId, synthesis });
  await reconcileRunFailure(runId, {
    debateComplete: true,
    artifactPhaseStarted: true,
  });
  await updateRunStatus(runId, "failed");
}

export function dispatchCoreArtifactSynthesisWorker(
  request: Request,
  runId: string,
  scope: RunOwnershipScope,
): void {
  const origin = resolveRequestOrigin(request);
  const cookie = request.headers.get("cookie");

  void fetch(`${origin}/api/runs/${runId}/synthesize`, {
    method: "POST",
    headers: cookie ? { cookie } : undefined,
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Synthesis worker returned ${response.status}`);
      }
    })
    .catch((error) => {
      console.warn("Synthesis worker dispatch failed, using in-process fallback", {
        runId,
        error,
      });
      void scheduleCoreArtifactSynthesis({ runId, scope }).catch((fallbackError) => {
        console.error("In-process artifact synthesis crashed", {
          runId,
          error: fallbackError,
        });
      });
    });
}
