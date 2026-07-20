import "server-only";

import type { TeamRoster } from "@/ai/agents/roster";
import { generateRunArtifacts } from "@/ai/artifacts/generate-run-artifacts";
import type { GenerateBlueprintArtifactResult } from "@/ai/artifacts/generate-blueprint-artifact.types";
import { isSimulationBudgetExceeded } from "@/ai/orchestration/simulation-budget";
import { isDebateCompleteFromMessages } from "@/ai/artifacts/regenerate-run-eligibility";
import {
  mapMessagesToTranscript,
  prepareArtifactGenerationContext,
} from "@/ai/artifacts/run-artifact-context";
import { saveSingleArtifact } from "@/lib/db/artifacts";
import { getRunWithMessages, touchRunActivity, updateRunSummary } from "@/lib/db/runs";
import {
  mergeRunSummarySynthesisTelemetry,
  parseRunSummary,
  RUN_SUMMARY_SYNTHESIS_VERSION,
} from "@/lib/db/run-summary";
import { toAppRunStatus } from "@/lib/db/run-status";
import type { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";
import {
  requireRunAccess,
  type RunOwnershipScope,
} from "@/lib/auth/run-ownership";

type RunWithMessages = NonNullable<Awaited<ReturnType<typeof getRunWithMessages>>>;

function getBlueprintBlockingError(
  run: RunWithMessages,
): GenerateBlueprintArtifactResult | null {
  if (run.messages.length === 0) {
    return { ok: false, error: "no_messages" };
  }

  const status = toAppRunStatus(run.status);
  const debateComplete = isDebateCompleteFromMessages(run.messages);

  if (status === "idle" || (status === "running" && !debateComplete)) {
    return { ok: false, error: "run_in_progress" };
  }

  const existingBlueprint = run.artifacts.find(
    (artifact) => artifact.type === "blueprint",
  );
  if (existingBlueprint) {
    return { ok: false, error: "already_ready" };
  }

  return null;
}

async function synthesizeBlueprintArtifact(params: {
  readonly runId: string;
  readonly run: RunWithMessages;
  readonly simulationMessages: RunWithMessages["messages"];
  readonly roster: TeamRoster;
  readonly usageAccumulator?: RunUsageAccumulator;
}): Promise<GenerateBlueprintArtifactResult> {
  try {
    await touchRunActivity(params.runId);

    const synthesisResult = await generateRunArtifacts({
      productIdea: params.run.userPrompt,
      transcript: mapMessagesToTranscript(params.simulationMessages),
      roster: params.roster,
      runSummary: params.run.summary,
      usageAccumulator: params.usageAccumulator,
      artifactTypes: ["blueprint"],
      onArtifactComplete: async (type, document) => {
        await saveSingleArtifact(params.runId, type, document);
      },
    });

    const blueprint = synthesisResult.artifacts.blueprint;
    if (!blueprint) {
      return { ok: false, error: "generation_failed" };
    }

    const mergedSummary = mergeRunSummarySynthesisTelemetry(
      params.run.summary,
      {
        synthesisVersion: RUN_SUMMARY_SYNTHESIS_VERSION,
        consistencyRetries: synthesisResult.consistencyRetries,
        stackValidationFailed: synthesisResult.stackValidationFailed,
        crossValidationFailed: synthesisResult.crossValidationFailed,
      },
      {
        accumulateValidationFailures: true,
        accumulateRetries: true,
      },
    );
    await updateRunSummary(params.runId, mergedSummary);

    const summaryPayload = parseRunSummary(mergedSummary);

    return {
      ok: true,
      artifacts: { blueprint: blueprint.sections },
      stackValidationFailed: summaryPayload?.stackValidationFailed === true,
      crossValidationFailed: summaryPayload?.crossValidationFailed === true,
    };
  } catch (error) {
    if (isSimulationBudgetExceeded(error)) {
      return { ok: false, error: "budget_exceeded" };
    }

    console.error("Blueprint artifact generation failed:", error);
    return {
      ok: false,
      error: "generation_failed",
      message:
        error instanceof Error ? error.message : "Blueprint generation failed",
    };
  }
}

export async function generateBlueprintArtifact(
  runId: string,
  options: {
    scope: RunOwnershipScope;
    usageAccumulator?: RunUsageAccumulator;
  },
): Promise<GenerateBlueprintArtifactResult> {
  const access = await requireRunAccess(runId, options.scope);
  if (!access.ok) {
    return {
      ok: false,
      error: access.reason === "not_found" ? "not_found" : "forbidden",
    };
  }

  const run = await getRunWithMessages(runId);
  if (!run) {
    return { ok: false, error: "not_found" };
  }

  const blockingError = getBlueprintBlockingError(run);
  if (blockingError) {
    return blockingError;
  }

  const prep = await prepareArtifactGenerationContext({
    runId,
    messages: run.messages,
    artifacts: run.artifacts,
    usageAccumulator: options.usageAccumulator,
  });
  if (!prep.ok) {
    return { ok: false, error: prep.error };
  }

  return synthesizeBlueprintArtifact({
    runId,
    run,
    simulationMessages: prep.simulationMessages,
    roster: prep.roster,
    usageAccumulator: options.usageAccumulator,
  });
}
