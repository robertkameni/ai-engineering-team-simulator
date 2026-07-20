import "server-only";

import { generateRunArtifacts } from "@/ai/artifacts/generate-run-artifacts";
import type { RegenerateRunArtifactsResult } from "@/ai/artifacts/regenerate-run-artifacts.types";
import {
  getRegenerateBlockingError,
  isDebateCompleteFromMessages,
} from "@/ai/artifacts/regenerate-run-eligibility";
import {
  mapMessagesToTranscript,
  prepareArtifactGenerationContext,
} from "@/ai/artifacts/run-artifact-context";
import { isSimulationBudgetExceeded } from "@/ai/orchestration/simulation-budget";
import {
  ARTIFACT_TYPES,
  type ArtifactType,
} from "@/features/artifacts/schemas";
import type { PartialRunArtifacts } from "@/features/artifacts/types";
import {
  runArtifactsOutputToBundle,
  saveSingleArtifact,
} from "@/lib/db/artifacts";
import {
  claimArtifactGeneration,
  toAppArtifactStatus,
  updateArtifactStatus,
} from "@/lib/db/artifact-status";
import { getRunWithMessages, touchRunActivity, updateRunStatus, updateRunSummary } from "@/lib/db/runs";
import {
  mergeRunSummarySynthesisTelemetry,
  mergeRunSummaryTimingTelemetry,
  RUN_SUMMARY_SYNTHESIS_VERSION,
} from "@/lib/db/run-summary";
import { reconcileStaleRunIfNeeded } from "@/lib/db/run-reconcile";
import { toAppRunStatus } from "@/lib/db/run-status";
import type { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";
import {
  requireRunAccess,
  type RunOwnershipScope,
} from "@/lib/auth/run-ownership";

type RunWithMessages = NonNullable<Awaited<ReturnType<typeof getRunWithMessages>>>;

async function loadRunForRegeneration(
  runId: string,
): Promise<RunWithMessages | null> {
  let run = await getRunWithMessages(runId);
  if (!run) {
    return null;
  }

  await reconcileStaleRunIfNeeded({
    id: run.id,
    status: run.status,
    artifactStatus: run.artifactStatus,
    updatedAt: run.updatedAt,
    messageCount: run.messages.length,
  });

  return getRunWithMessages(runId);
}

async function finalizeRegenerateFailure(
  runId: string,
  status: ReturnType<typeof toAppRunStatus>,
): Promise<void> {
  await updateArtifactStatus(runId, "failed");
  if (status === "running") {
    await updateRunStatus(runId, "complete");
  }
}

async function finalizeRegenerateSuccess(
  runId: string,
  run: RunWithMessages,
  synthesisResult: Awaited<ReturnType<typeof generateRunArtifacts>>,
  usageAccumulator: RunUsageAccumulator | undefined,
  status: ReturnType<typeof toAppRunStatus>,
): Promise<PartialRunArtifacts> {
  const bundle = runArtifactsOutputToBundle(synthesisResult.artifacts);
  const withSynthesis = mergeRunSummarySynthesisTelemetry(run.summary, {
    synthesisVersion: RUN_SUMMARY_SYNTHESIS_VERSION,
    consistencyRetries: synthesisResult.consistencyRetries,
    stackValidationFailed: synthesisResult.stackValidationFailed,
    crossValidationFailed: synthesisResult.crossValidationFailed,
  });
  const peakPromptTokens =
    usageAccumulator?.getTotals().peakPromptTokens ?? null;

  await updateRunSummary(
    runId,
    mergeRunSummaryTimingTelemetry(withSynthesis, {
      artifactDurationMs: synthesisResult.artifactDurationMs ?? null,
      peakPromptTokens,
    }),
  );
  await updateArtifactStatus(runId, "ready");

  if (status !== "complete") {
    await updateRunStatus(runId, "complete");
  }

  return bundle;
}

export async function regenerateRunArtifacts(
  runId: string,
  options: {
    scope: RunOwnershipScope;
    usageAccumulator?: RunUsageAccumulator;
    artifactTypes?: readonly ArtifactType[];
  },
): Promise<RegenerateRunArtifactsResult> {
  const access = await requireRunAccess(runId, options.scope);
  if (!access.ok) {
    return {
      ok: false,
      error: access.reason === "not_found" ? "not_found" : "forbidden",
    };
  }

  const run = await loadRunForRegeneration(runId);
  if (!run) {
    return { ok: false, error: "not_found" };
  }

  if (run.messages.length === 0) {
    return { ok: false, error: "no_messages" };
  }

  const status = toAppRunStatus(run.status);
  const artifactStatus = toAppArtifactStatus(run.artifactStatus);
  const blockingError = getRegenerateBlockingError(
    status,
    artifactStatus,
    isDebateCompleteFromMessages(run.messages),
  );
  if (blockingError) {
    return { ok: false, error: blockingError };
  }

  const prep = await prepareArtifactGenerationContext({
    runId,
    messages: run.messages,
    artifacts: run.artifacts,
    usageAccumulator: options.usageAccumulator,
    logBudgetExceeded: true,
  });
  if (!prep.ok) {
    return { ok: false, error: prep.error };
  }

  const claimed = await claimArtifactGeneration(runId);
  if (!claimed) {
    return {
      ok: false,
      error: "generation_active",
      message: "A generation process is already active for this workspace.",
    };
  }

  try {
    await touchRunActivity(runId);

    const synthesisResult = await generateRunArtifacts({
      productIdea: run.userPrompt,
      transcript: mapMessagesToTranscript(prep.simulationMessages),
      roster: prep.roster,
      runSummary: run.summary,
      usageAccumulator: options.usageAccumulator,
      artifactTypes: options.artifactTypes ?? ARTIFACT_TYPES,
      onArtifactComplete: async (type, document) => {
        await saveSingleArtifact(runId, type, document);
      },
    });

    const bundle = await finalizeRegenerateSuccess(
      runId,
      run,
      synthesisResult,
      options.usageAccumulator,
      status,
    );

    return { ok: true, artifacts: bundle };
  } catch (error) {
    if (isSimulationBudgetExceeded(error)) {
      console.warn("Regenerate artifacts: budget exceeded during generation", {
        runId,
        estimatedCostUsd: error.estimatedCostUsd,
        maxCostUsd: error.maxCostUsd,
      });
      await finalizeRegenerateFailure(runId, status);
      return { ok: false, error: "budget_exceeded" };
    }

    console.error("Regenerate artifacts failed:", error);
    await finalizeRegenerateFailure(runId, status);
    return {
      ok: false,
      error: "generation_failed",
      message:
        error instanceof Error ? error.message : "Artifact generation failed",
    };
  }
}
