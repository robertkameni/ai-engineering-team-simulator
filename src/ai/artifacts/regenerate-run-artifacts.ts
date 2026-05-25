import { SIMULATION_AGENT_ORDER } from "@/ai/agents/config";
import { isStoredSimulationAgentRole } from "@/ai/config";
import type { TeamRoster } from "@/ai/agents/roster";
import { generateRunArtifacts } from "@/ai/artifacts/generate-run-artifacts";
import type { TranscriptEntry } from "@/ai/context/transcript";
import { isDebateComplete } from "@/ai/orchestration/reviewer-decision";
import type { AgentRole } from "@/features/agents/types";
import { getPersona } from "@/features/agents/personas";
import { type RunArtifacts } from "@/features/artifacts/types";
import {
  runArtifactsOutputToBundle,
  saveSingleArtifact,
} from "@/lib/db/artifacts";
import {
  toAppArtifactStatus,
  updateArtifactStatus,
} from "@/lib/db/artifact-status";
import { getRunWithMessages, touchRunActivity, updateRunStatus } from "@/lib/db/runs";
import { reconcileStaleRunIfNeeded } from "@/lib/db/run-reconcile";
import { toAppRunStatus } from "@/lib/db/run-status";
import {
  getTeamRoster,
  parseTeamRoster,
  TEAM_ROSTER_ARTIFACT_TYPE,
} from "@/lib/db/team-roster";
import type { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";

export type RegenerateRunArtifactsError =
  | "not_found"
  | "no_messages"
  | "run_in_progress"
  | "generation_failed";

export type RegenerateRunArtifactsResult =
  | { ok: true; artifacts: RunArtifacts }
  | { ok: false; error: RegenerateRunArtifactsError; message?: string };

function buildRosterFromMessages(
  messages: { agentRole: string; agentName: string | null }[],
): TeamRoster {
  const roster = { templateId: "software" } as TeamRoster;

  for (const role of SIMULATION_AGENT_ORDER) {
    const message = messages.find((entry) => entry.agentRole === role);
    const persona = getPersona(role);
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
  messages: { agentRole: string; agentName: string | null; content: string }[],
): TranscriptEntry[] {
  return messages.map((message) => {
    const role = message.agentRole as AgentRole;
    return {
      role,
      agentName: message.agentName ?? getPersona(role).name,
      content: message.content,
    };
  });
}

export async function regenerateRunArtifacts(
  runId: string,
  options: { usageAccumulator?: RunUsageAccumulator } = {},
): Promise<RegenerateRunArtifactsResult> {
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

  try {
    await updateArtifactStatus(runId, "generating");
    await touchRunActivity(runId);

    const artifactOutput = await generateRunArtifacts({
      productIdea: run.userPrompt,
      transcript: mapMessagesToTranscript(simulationMessages),
      roster,
      usageAccumulator: options.usageAccumulator,
      onArtifactComplete: async (type, document) => {
        await saveSingleArtifact(runId, type, document);
      },
    });
    const bundle = runArtifactsOutputToBundle(artifactOutput);
    await updateArtifactStatus(runId, "ready");
    if (status === "running") {
      await updateRunStatus(runId, "complete");
    }

    return { ok: true, artifacts: bundle };
  } catch (error) {
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
