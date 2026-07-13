import "server-only";

import { regenerateRunArtifacts } from "@/ai/artifacts/regenerate-run-artifacts";
import { CORE_ARTIFACT_TYPES } from "@/features/artifacts/artifact-constants";
import type { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";
import type { RunOwnershipScope } from "@/lib/auth/run-ownership";
import { reconcileRunFailure } from "@/lib/db/run-reconcile";
import { setRunUsageTotals, updateRunStatus } from "@/lib/db/runs";

export async function scheduleCoreArtifactSynthesis({
  runId,
  scope,
  usageAccumulator,
}: {
  runId: string;
  scope: RunOwnershipScope;
  usageAccumulator?: RunUsageAccumulator;
}): Promise<void> {
  const synthesis = await regenerateRunArtifacts(runId, {
    scope,
    usageAccumulator,
    artifactTypes: CORE_ARTIFACT_TYPES,
  });

  if (usageAccumulator) {
    await setRunUsageTotals(runId, usageAccumulator.getTotals());
  }

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
