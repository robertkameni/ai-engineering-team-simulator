import { SIMULATION_AGENT_ORDER } from "@/ai/agents/config";
import { isStoredSimulationAgentRole } from "@/ai/config";
import type { TeamRoster } from "@/ai/agents/roster";
import { generateRunArtifacts } from "@/ai/artifacts/generate-run-artifacts";
import type { RegenerateRunArtifactsResult } from "@/ai/artifacts/regenerate-run-artifacts.types";
import type { TranscriptEntry } from "@/ai/context/transcript";
import {
  assertSimulationWithinBudget,
  isSimulationBudgetExceeded,
} from "@/ai/orchestration/simulation-budget";
import { isDebateComplete } from "@/ai/orchestration/reviewer-decision";
import type { AgentRole } from "@/features/agents/types";
import { getPersonaBase } from "@/features/agents/personas";
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
  RUN_SUMMARY_SYNTHESIS_VERSION,
} from "@/lib/db/run-summary";
import { reconcileStaleRunIfNeeded } from "@/lib/db/run-reconcile";
import { toAppRunStatus } from "@/lib/db/run-status";
import {
  getTeamRoster,
  parseTeamRoster,
  TEAM_ROSTER_ARTIFACT_TYPE,
} from "@/lib/db/team-roster";
import type { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";
import {
  requireRunAccess,
  type RunOwnershipScope,
} from "@/lib/auth/run-ownership";

function buildRosterFromMessages(
  messages: { agentRole: string; agentName: string | null; }[],
): TeamRoster {
  const roster = { templateId: "software" } as TeamRoster;

  for (const role of SIMULATION_AGENT_ORDER) {
    const message = messages.find((entry) => entry.agentRole === role);
    const persona = getPersonaBase(role);
    roster[role] = {
      role,
      name: message?.agentName ?? persona.name,
      title: persona.title,
      initials: persona.initials,
    };
  }

  return roster;
}

function mapMessagesToTranscript(
  messages: { agentRole: string; agentName: string | null; content: string; }[],
): TranscriptEntry[] {
  return messages.map((message) => {
    const role = message.agentRole as AgentRole;
    return {
      role,
      agentName: message.agentName ?? getPersonaBase(role).name,
      content: message.content,
    };
  });
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

  let run = await getRunWithMessages(runId);
  if (!run) {
    return { ok: false, error: "not_found" };
  }

  await reconcileStaleRunIfNeeded({
    id: run.id,
    status: run.status,
    artifactStatus: run.artifactStatus,
    updatedAt: run.updatedAt,
    messageCount: run.messages.length,
  });

  run = await getRunWithMessages(runId);
  if (!run) {
    return { ok: false, error: "not_found" };
  }

  if (run.messages.length === 0) {
    return { ok: false, error: "no_messages" };
  }

  const status = toAppRunStatus(run.status);
  const artifactStatus = toAppArtifactStatus(run.artifactStatus);
  const debateComplete = isDebateComplete(
    run.messages.map((message) => ({
      agentRole: message.agentRole,
      content: message.content,
    })),
  );

  if (status === "idle") {
    return { ok: false, error: "run_in_progress" };
  }

  if (status === "running") {
    if (!debateComplete) {
      return { ok: false, error: "run_in_progress" };
    }
    if (artifactStatus === "generating" || artifactStatus === "ready") {
      return { ok: false, error: "run_in_progress" };
    }
  } else if (artifactStatus === "generating") {
    return { ok: false, error: "run_in_progress" };
  }

  const simulationMessages = run.messages.filter((message) =>
    isStoredSimulationAgentRole(message.agentRole),
  );

  if (simulationMessages.length === 0) {
    return {
      ok: false,
      error: "generation_failed",
    };
  }

  const rosterArtifact = run.artifacts.find(
    (artifact) => artifact.type === TEAM_ROSTER_ARTIFACT_TYPE,
  );
  const roster =
    parseTeamRoster(rosterArtifact?.data) ??
    (await getTeamRoster(runId)) ??
    buildRosterFromMessages(simulationMessages);

  if (options.usageAccumulator) {
    try {
      assertSimulationWithinBudget(options.usageAccumulator);
    } catch (error) {
      if (isSimulationBudgetExceeded(error)) {
        console.warn("Regenerate artifacts: budget exceeded before generation", {
          runId,
          estimatedCostUsd: error.estimatedCostUsd,
          maxCostUsd: error.maxCostUsd,
        });
        return { ok: false, error: "budget_exceeded" };
      }
      throw error;
    }
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
      transcript: mapMessagesToTranscript(simulationMessages),
      roster,
      runSummary: run.summary,
      usageAccumulator: options.usageAccumulator,
      artifactTypes: options.artifactTypes ?? ARTIFACT_TYPES,
      onArtifactComplete: async (type, document) => {
        await saveSingleArtifact(runId, type, document);
      },
    });
    const bundle = runArtifactsOutputToBundle(synthesisResult.artifacts);
    await updateRunSummary(
      runId,
      mergeRunSummarySynthesisTelemetry(run.summary, {
        synthesisVersion: RUN_SUMMARY_SYNTHESIS_VERSION,
        consistencyRetries: synthesisResult.consistencyRetries,
        stackValidationFailed: synthesisResult.stackValidationFailed,
      }),
    );
    await updateArtifactStatus(runId, "ready");
    if (status !== "complete") {
      await updateRunStatus(runId, "complete");
    }

    return { ok: true, artifacts: bundle };
  } catch (error) {
    if (isSimulationBudgetExceeded(error)) {
      console.warn("Regenerate artifacts: budget exceeded during generation", {
        runId,
        estimatedCostUsd: error.estimatedCostUsd,
        maxCostUsd: error.maxCostUsd,
      });
      await updateArtifactStatus(runId, "failed");
      if (status === "running") {
        await updateRunStatus(runId, "complete");
      }
      return { ok: false, error: "budget_exceeded" };
    }

    console.error("Regenerate artifacts failed:", error);
    await updateArtifactStatus(runId, "failed");
    if (status === "running") {
      await updateRunStatus(runId, "complete");
    }
    return {
      ok: false,
      error: "generation_failed",
      message:
        error instanceof Error ? error.message : "Artifact generation failed",
    };
  }
}
