import "server-only";

import {
  buildFailedArtifactPlaceholder,
  listMissingCoreArtifactTypes,
} from "@/ai/artifacts/failed-artifact-placeholder";
import { regenerateRunArtifacts } from "@/ai/artifacts/regenerate-run-artifacts";
import { CORE_ARTIFACT_TYPES } from "@/lib/artifact-constants";
import { isArtifactType, type ArtifactType } from "@/features/artifacts/schemas";
import {
  createRunUsageAccumulator,
  type RunUsageAccumulator,
} from "@/lib/ai/run-usage-accumulator";
import type { RunOwnershipScope } from "@/lib/auth/run-ownership";
import { saveSingleArtifact } from "@/lib/db/artifacts";
import { reconcileRunFailure } from "@/lib/db/run-reconcile";
import {
  computeTotalDurationMs,
  computeUserWaitMs,
  mergeRunSummaryTimingTelemetry,
  parseRunSummary,
} from "@/lib/db/run-summary";
import {
  getRunUsageTotalsById,
  getRunWithMessages,
  setRunUsageTotals,
  updateRunStatus,
  updateRunSummary,
} from "@/lib/db/runs";
import { resolveRequestOrigin } from "@/lib/http/resolve-request-origin";

/** Soft ceiling under route maxDuration for in-request synthesis await. */
export const ARTIFACT_SYNTHESIS_AWAIT_TIMEOUT_MS = 280_000;

export type ArtifactSynthesisAwaitResult = {
  readonly completed: boolean;
  readonly timedOut: boolean;
  readonly ok: boolean;
  readonly artifactDurationMs: number | null;
  readonly error: string | null;
};

export async function scheduleCoreArtifactSynthesis({
  runId,
  scope,
  usageAccumulator,
  onArtifactComplete,
  retryOnce = true,
}: {
  runId: string;
  scope: RunOwnershipScope;
  usageAccumulator?: RunUsageAccumulator;
  onArtifactComplete?: (type: ArtifactType) => void;
  retryOnce?: boolean;
}): Promise<{
  ok: boolean;
  artifactDurationMs: number | null;
  error: string | null;
}> {
  const accumulator =
    usageAccumulator ??
    createRunUsageAccumulator(await getRunUsageTotalsById(runId));

  const attempt = async (): Promise<{
    ok: boolean;
    artifactDurationMs: number | null;
    error: string | null;
  }> => {
    const synthesis = await regenerateRunArtifacts(runId, {
      scope,
      usageAccumulator: accumulator,
      artifactTypes: CORE_ARTIFACT_TYPES,
      onArtifactComplete,
    });

    await setRunUsageTotals(runId, accumulator.getTotals());

    if (synthesis.ok) {
      await updateRunStatus(runId, "complete");
      return {
        ok: true,
        artifactDurationMs: synthesis.artifactDurationMs ?? null,
        error: null,
      };
    }

    if (synthesis.error === "budget_exceeded") {
      console.warn("Background artifact synthesis stopped: budget exceeded", {
        runId,
      });
      await reconcileRunFailure(runId, {
        debateComplete: true,
        artifactPhaseStarted: true,
      });
      await updateRunStatus(runId, "failed");
      return {
        ok: false,
        artifactDurationMs: synthesis.artifactDurationMs ?? null,
        error: "budget_exceeded",
      };
    }

    if (
      synthesis.error === "generation_active" ||
      synthesis.error === "run_in_progress"
    ) {
      return {
        ok: false,
        artifactDurationMs: synthesis.artifactDurationMs ?? null,
        error: synthesis.error,
      };
    }

    console.error("Background artifact synthesis failed", { runId, synthesis });
    await reconcileRunFailure(runId, {
      debateComplete: true,
      artifactPhaseStarted: true,
    });
    await updateRunStatus(runId, "failed");
    return {
      ok: false,
      artifactDurationMs: synthesis.artifactDurationMs ?? null,
      error: synthesis.error,
    };
  };

  const first = await attempt();
  if (first.ok) {
    return first;
  }

  const isRetryableSoftError =
    first.error === "generation_active" || first.error === "run_in_progress";

  if (retryOnce && isRetryableSoftError) {
    console.warn("Artifact synthesis soft-blocked; retrying once", {
      runId,
      error: first.error,
    });
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const second = await attempt();
    if (second.ok) {
      return second;
    }

    console.error("Artifact synthesis soft-block persisted after retry", {
      runId,
      error: second.error,
    });
    await persistSoftBlockArtifactFailure(runId, second.error, true);
    await reconcileRunFailure(runId, {
      debateComplete: true,
      artifactPhaseStarted: true,
    });
    await updateRunStatus(runId, "failed");
    return second;
  }

  if (isRetryableSoftError) {
    await persistSoftBlockArtifactFailure(runId, first.error, false);
    await reconcileRunFailure(runId, {
      debateComplete: true,
      artifactPhaseStarted: true,
    });
    await updateRunStatus(runId, "failed");
  }

  return first;
}

async function persistSoftBlockArtifactFailure(
  runId: string,
  errorCode: string | null,
  retryFailed: boolean,
): Promise<void> {
  const run = await getRunWithMessages(runId);
  if (!run) {
    return;
  }

  const message =
    errorCode === "run_in_progress"
      ? "Artifact synthesis blocked: run still treated as in progress after debate approval (message-tag debate-complete check disagreed with summary debateOutcome)."
      : `Artifact synthesis blocked: ${errorCode ?? "unknown"}`;

  const present = new Set(
    run.artifacts
      .map((artifact) => artifact.type)
      .filter((type): type is ArtifactType => isArtifactType(type)),
  );
  const missing = listMissingCoreArtifactTypes(present);
  for (const type of missing) {
    await saveSingleArtifact(
      runId,
      type,
      buildFailedArtifactPlaceholder(type, message),
    );
  }

  const existing = parseRunSummary(run.summary);
  const timingParams = {
    debateDurationMs: existing?.debateDurationMs ?? null,
    artifactDurationMs: existing?.artifactDurationMs ?? 0,
  };

  await updateRunSummary(
    runId,
    mergeRunSummaryTimingTelemetry(run.summary, {
      artifactDurationMs: timingParams.artifactDurationMs,
      totalDurationMs: computeTotalDurationMs(timingParams),
      userWaitMs: computeUserWaitMs(timingParams),
      artifactsPending: false,
      artifactError: {
        message,
        failedArtifact: missing[0] ?? null,
        timestamp: new Date().toISOString(),
        retryFailed,
        errorCode: errorCode ?? "soft_block",
      },
    }),
  );
}

/**
 * Await in-process synthesis with a hard timeout so SSE `done` is not delayed
 * forever, while still preferring completion over fire-and-forget.
 */
export async function awaitCoreArtifactSynthesis({
  runId,
  scope,
  usageAccumulator,
  timeoutMs = ARTIFACT_SYNTHESIS_AWAIT_TIMEOUT_MS,
  onArtifactComplete,
}: {
  runId: string;
  scope: RunOwnershipScope;
  usageAccumulator?: RunUsageAccumulator;
  timeoutMs?: number;
  onArtifactComplete?: (type: ArtifactType) => void;
}): Promise<ArtifactSynthesisAwaitResult> {
  let timedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<ArtifactSynthesisAwaitResult>((resolve) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      console.warn("Artifact synthesis await timed out; continuing stream", {
        runId,
        timeoutMs,
      });
      resolve({
        completed: false,
        timedOut: true,
        ok: false,
        artifactDurationMs: null,
        error: "artifact_timeout",
      });
    }, timeoutMs);
  });

  const synthesisPromise = scheduleCoreArtifactSynthesis({
    runId,
    scope,
    usageAccumulator,
    onArtifactComplete,
  }).then((result) => ({
    completed: true,
    timedOut: false,
    ok: result.ok,
    artifactDurationMs: result.artifactDurationMs,
    error: result.error,
  }));

  const winner = await Promise.race([synthesisPromise, timeoutPromise]);

  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }

  if (timedOut && !winner.timedOut) {
    return winner;
  }

  if (winner.timedOut) {
    // Keep synthesis running in-process after timeout so polling can still succeed.
    void synthesisPromise.catch((error) => {
      console.error("Late artifact synthesis after timeout failed", {
        runId,
        error,
      });
    });
  }

  return winner;
}

/**
 * Fire-and-forget worker dispatch kept as a recovery path when the simulate
 * request cannot await (e.g. client disconnect after debate). Prefer
 * `awaitCoreArtifactSynthesis` on the happy path.
 */
export function dispatchCoreArtifactSynthesisWorker(
  request: Request,
  runId: string,
  scope: RunOwnershipScope,
): void {
  const origin = resolveRequestOrigin(request);
  const cookie = request.headers.get("cookie");

  void fetch(`${origin}/api/runs/${runId}/synthesize`, {
    method: "POST",
    headers: {
      Origin: origin,
      ...(cookie ? { cookie } : {}),
    },
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
