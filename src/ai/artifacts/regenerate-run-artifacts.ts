import "server-only";

import { generateRunArtifacts } from "@/ai/artifacts/generate-run-artifacts";
import type {
  RegenerateRunArtifactsOptions,
  RegenerateRunArtifactsResult,
} from "@/ai/artifacts/regenerate-run-artifacts.types";
import {
  getRegenerateBlockingError,
  isDebateCompleteForArtifactSynthesis,
} from "@/ai/artifacts/regenerate-run-eligibility";
import {
  buildFailedArtifactPlaceholder,
  listMissingCoreArtifactTypes,
} from "@/ai/artifacts/failed-artifact-placeholder";
import {
  mapMessagesToTranscript,
  prepareArtifactGenerationContext,
} from "@/ai/artifacts/run-artifact-context";
import {
  isSimulationBudgetExceeded,
} from "@/ai/orchestration/simulation-budget";
import { parseDebateOutcomeFromRunSummary } from "@/ai/orchestration/reviewer-decision";
import { CORE_ARTIFACT_TYPES } from "@/lib/artifact-constants";
import {
  ARTIFACT_TYPES,
} from "@/features/artifacts/schemas";
import type { ArtifactType } from "@/features/artifacts/schemas";
import type { PartialRunArtifacts } from "@/features/artifacts/types";
import {
  runArtifactsOutputToBundle,
  runStillExists,
  saveSingleArtifact,
} from "@/lib/db/artifacts";
import {
  claimArtifactGeneration,
  toAppArtifactStatus,
  updateArtifactStatus,
} from "@/lib/db/artifact-status";
import {
  getRunWithMessages,
  touchRunActivity,
  updateRunStatus,
  updateRunSummary,
} from "@/lib/db/runs";
import {
  computeTotalDurationMs,
  computeUserWaitMs,
  mergeRunSummarySynthesisTelemetry,
  mergeRunSummaryTimingTelemetry,
  parseRunSummary,
  RUN_SUMMARY_SYNTHESIS_VERSION,
} from "@/lib/db/run-summary";
import type { ArtifactErrorTelemetry } from "@/lib/db/run-summary.types";
import { reconcileStaleRunIfNeeded } from "@/lib/db/run-reconcile";
import { toAppRunStatus } from "@/lib/db/run-status";
import type { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";
import { requireRunAccess } from "@/lib/auth/run-ownership";

type RunWithMessages = NonNullable<Awaited<ReturnType<typeof getRunWithMessages>>>;

async function loadRunForRegeneration(
  runId: string,
): Promise<RunWithMessages | null> {
  const run = await getRunWithMessages(runId);
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

async function persistArtifactTiming(
  runId: string,
  existingSummary: string | null,
  params: {
    readonly artifactDurationMs: number | null;
    readonly peakPromptTokens?: number | null;
    readonly artifactsPending: boolean;
    readonly artifactError?: ArtifactErrorTelemetry | null;
  },
): Promise<void> {
  const existing = parseRunSummary(existingSummary);
  const debateDurationMs = existing?.debateDurationMs ?? null;
  const timingParams = {
    debateDurationMs,
    artifactDurationMs: params.artifactDurationMs,
  };
  const totalDurationMs = computeTotalDurationMs(timingParams);
  const userWaitMs = computeUserWaitMs(timingParams);

  await updateRunSummary(
    runId,
    mergeRunSummaryTimingTelemetry(existingSummary, {
      artifactDurationMs: params.artifactDurationMs,
      totalDurationMs,
      userWaitMs,
      artifactsPending: params.artifactsPending,
      peakPromptTokens: params.peakPromptTokens,
      artifactError: params.artifactError,
    }),
  );
}

async function persistMissingArtifactPlaceholders(
  runId: string,
  errorMessage: string,
  onArtifactComplete?: (type: ArtifactType) => void,
): Promise<readonly ArtifactType[]> {
  const existing = await getRunWithMessages(runId);
  const present = new Set(
    (existing?.artifacts ?? [])
      .map((artifact) => artifact.type)
      .filter((type): type is ArtifactType =>
        (CORE_ARTIFACT_TYPES as readonly string[]).includes(type),
      ),
  );
  const missing = listMissingCoreArtifactTypes(present);
  for (const type of missing) {
    const placeholder = buildFailedArtifactPlaceholder(type, errorMessage);
    await saveSingleArtifact(runId, type, placeholder);
    onArtifactComplete?.(type);
  }
  return missing;
}

async function finalizeRegenerateFailure(
  runId: string,
  status: ReturnType<typeof toAppRunStatus>,
  existingSummary: string | null,
  artifactDurationMs: number | null,
  peakPromptTokens: number | null,
  artifactError: ArtifactErrorTelemetry,
  onArtifactComplete?: (type: ArtifactType) => void,
): Promise<void> {
  const missing = await persistMissingArtifactPlaceholders(
    runId,
    artifactError.message,
    onArtifactComplete,
  );
  await persistArtifactTiming(runId, existingSummary, {
    artifactDurationMs,
    peakPromptTokens,
    artifactsPending: false,
    artifactError: {
      ...artifactError,
      failedArtifact: missing[0] ?? artifactError.failedArtifact,
    },
  });
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

  await persistArtifactTiming(runId, withSynthesis, {
    artifactDurationMs: synthesisResult.artifactDurationMs ?? null,
    peakPromptTokens,
    artifactsPending: false,
    artifactError: null,
  });
  await updateArtifactStatus(runId, "ready");

  if (status !== "complete") {
    await updateRunStatus(runId, "complete");
  }

  return bundle;
}

export async function regenerateRunArtifacts(
  runId: string,
  options: RegenerateRunArtifactsOptions,
): Promise<RegenerateRunArtifactsResult> {
  const access = await requireRunAccess(runId, options.scope);
  if (!access.ok) {
    return {
      ok: false,
      error: access.reason === "not_found" ? "not_found" : "forbidden",
      artifactDurationMs: null,
    };
  }

  const run = await loadRunForRegeneration(runId);
  if (!run) {
    return { ok: false, error: "not_found", artifactDurationMs: null };
  }

  if (run.messages.length === 0) {
    return { ok: false, error: "no_messages", artifactDurationMs: null };
  }

  const status = toAppRunStatus(run.status);
  const artifactStatus = toAppArtifactStatus(run.artifactStatus);
  const debateOutcome = parseDebateOutcomeFromRunSummary(run.summary);
  const debateComplete = isDebateCompleteForArtifactSynthesis({
    messages: run.messages,
    debateOutcome,
  });
  const blockingError = getRegenerateBlockingError(
    status,
    artifactStatus,
    debateComplete,
  );
  if (blockingError) {
    console.warn("Artifact synthesis blocked", {
      runId,
      blockingError,
      debateOutcome,
      debateComplete,
      status,
      artifactStatus,
    });
    return { ok: false, error: blockingError, artifactDurationMs: null };
  }

  const prep = await prepareArtifactGenerationContext({
    runId,
    messages: run.messages,
    artifacts: run.artifacts,
    usageAccumulator: options.usageAccumulator,
    logBudgetExceeded: true,
  });
  if (!prep.ok) {
    return { ok: false, error: prep.error, artifactDurationMs: null };
  }

  const claimed = await claimArtifactGeneration(runId);
  if (!claimed) {
    return {
      ok: false,
      error: "generation_active",
      message: "A generation process is already active for this workspace.",
      artifactDurationMs: null,
    };
  }

  const artifactPhaseStartedAt = Date.now();
  const peakPromptTokens =
    options.usageAccumulator?.getTotals().peakPromptTokens ?? null;

  try {
    await touchRunActivity(runId);
    await updateRunSummary(
      runId,
      mergeRunSummaryTimingTelemetry(run.summary, {
        artifactsPending: true,
      }),
    );

    const synthesisResult = await generateRunArtifacts({
      productIdea: run.userPrompt,
      transcript: mapMessagesToTranscript(prep.simulationMessages),
      roster: prep.roster,
      runSummary: run.summary,
      usageAccumulator: options.usageAccumulator,
      artifactTypes: options.artifactTypes ?? ARTIFACT_TYPES,
      onArtifactComplete: async (type, document) => {
        await saveSingleArtifact(runId, type, document);
        options.onArtifactComplete?.(type);
      },
    });

    if (!(await runStillExists(runId))) {
      // Run deleted while artifacts were being generated; there is nothing to
      // finalize for it.
      return {
        ok: false,
        error: "not_found",
        artifactDurationMs: Date.now() - artifactPhaseStartedAt,
      };
    }

    const bundle = await finalizeRegenerateSuccess(
      runId,
      run,
      synthesisResult,
      options.usageAccumulator,
      status,
    );

    return {
      ok: true,
      artifacts: bundle,
      artifactDurationMs: synthesisResult.artifactDurationMs ?? null,
    };
  } catch (error) {
    const artifactDurationMs = Date.now() - artifactPhaseStartedAt;

    if (!(await runStillExists(runId))) {
      return { ok: false, error: "not_found", artifactDurationMs };
    }

    if (isSimulationBudgetExceeded(error)) {
      console.warn("Regenerate artifacts: budget exceeded during generation", {
        runId,
        estimatedCostUsd: error.estimatedCostUsd,
        maxCostUsd: error.maxCostUsd,
        artifactDurationMs,
      });
      await finalizeRegenerateFailure(
        runId,
        status,
        run.summary,
        artifactDurationMs,
        peakPromptTokens,
        {
          message: `Budget exceeded during artifact synthesis ($${error.estimatedCostUsd.toFixed(4)} / $${error.maxCostUsd.toFixed(2)}).`,
          failedArtifact: null,
          timestamp: new Date().toISOString(),
          retryFailed: false,
          errorCode: "budget_exceeded",
        },
        options.onArtifactComplete,
      );
      return {
        ok: false,
        error: "budget_exceeded",
        artifactDurationMs,
      };
    }

    const message =
      error instanceof Error ? error.message : "Artifact generation failed";
    console.error("Regenerate artifacts failed:", {
      runId,
      artifactDurationMs,
      error,
    });
    await finalizeRegenerateFailure(
      runId,
      status,
      run.summary,
      artifactDurationMs,
      peakPromptTokens,
      {
        message,
        failedArtifact: null,
        timestamp: new Date().toISOString(),
        retryFailed: false,
        errorCode: "generation_failed",
      },
      options.onArtifactComplete,
    );
    return {
      ok: false,
      error: "generation_failed",
      message,
      artifactDurationMs,
    };
  }
}
