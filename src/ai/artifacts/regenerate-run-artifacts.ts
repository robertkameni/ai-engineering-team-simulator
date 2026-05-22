import { SIMULATION_AGENT_ORDER } from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";
import { generateRunArtifacts } from "@/ai/artifacts/generate-run-artifacts";
import type { TranscriptEntry } from "@/ai/context/transcript";
import type { AgentRole } from "@/features/agents/types";
import { getPersona } from "@/features/agents/personas";
import { type RunArtifacts } from "@/features/artifacts/types";
import {
  runArtifactsOutputToBundle,
  saveArtifactBundle,
} from "@/lib/db/artifacts";
import {
  toAppArtifactStatus,
  updateArtifactStatus,
} from "@/lib/db/artifact-status";
import { getRunWithMessages } from "@/lib/db/runs";
import { toAppRunStatus } from "@/lib/db/run-status";
import {
  getTeamRoster,
  parseTeamRoster,
  TEAM_ROSTER_ARTIFACT_TYPE,
} from "@/lib/db/team-roster";

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
  const roster = {} as TeamRoster;

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
): Promise<RegenerateRunArtifactsResult> {
  const run = await getRunWithMessages(runId);
  if (!run) {
    return { ok: false, error: "not_found" };
  }

  if (run.messages.length === 0) {
    return { ok: false, error: "no_messages" };
  }

  const status = toAppRunStatus(run.status);
  const artifactStatus = toAppArtifactStatus(run.artifactStatus);
  if (status === "running" || status === "idle") {
    return { ok: false, error: "run_in_progress" };
  }
  if (artifactStatus === "generating") {
    return { ok: false, error: "run_in_progress" };
  }

  const rosterArtifact = run.artifacts.find(
    (artifact) => artifact.type === TEAM_ROSTER_ARTIFACT_TYPE,
  );
  const roster =
    parseTeamRoster(rosterArtifact?.data) ??
    (await getTeamRoster(runId)) ??
    buildRosterFromMessages(run.messages);

  try {
    await updateArtifactStatus(runId, "generating");

    const artifactOutput = await generateRunArtifacts({
      productIdea: run.userPrompt,
      transcript: mapMessagesToTranscript(run.messages),
      roster,
    });
    const bundle = runArtifactsOutputToBundle(artifactOutput);
    await saveArtifactBundle(runId, bundle);
    await updateArtifactStatus(runId, "ready");

    return { ok: true, artifacts: bundle };
  } catch (error) {
    console.error("Regenerate artifacts failed:", error);
    await updateArtifactStatus(runId, "failed");
    return {
      ok: false,
      error: "generation_failed",
      message:
        error instanceof Error ? error.message : "Artifact generation failed",
    };
  }
}
