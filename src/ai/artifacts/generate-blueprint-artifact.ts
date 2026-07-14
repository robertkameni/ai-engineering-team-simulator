import "server-only";

import { generateRunArtifacts } from "@/ai/artifacts/generate-run-artifacts";
import type { GenerateBlueprintArtifactResult } from "@/ai/artifacts/generate-blueprint-artifact.types";
import { SIMULATION_AGENT_ORDER } from "@/ai/agents/config";
import { isStoredSimulationAgentRole } from "@/ai/config";
import type { TeamRoster } from "@/ai/agents/roster";
import type { TranscriptEntry } from "@/ai/context/transcript";
import {
  assertSimulationWithinBudget,
  isSimulationBudgetExceeded,
} from "@/ai/orchestration/simulation-budget";
import { isDebateComplete } from "@/ai/orchestration/reviewer-decision";
import type { AgentRole } from "@/features/agents/types";
import { getPersonaBase } from "@/features/agents/personas";
import type { PartialRunArtifacts } from "@/features/artifacts/types";
import { saveSingleArtifact } from "@/lib/db/artifacts";
import { getRunWithMessages, touchRunActivity } from "@/lib/db/runs";
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

  if (run.messages.length === 0) {
    return { ok: false, error: "no_messages" };
  }

  const status = toAppRunStatus(run.status);
  const debateComplete = isDebateComplete(
    run.messages.map((message) => ({
      agentRole: message.agentRole,
      content: message.content,
    })),
  );

  if (status === "idle" || (status === "running" && !debateComplete)) {
    return { ok: false, error: "run_in_progress" };
  }

  const existingBlueprint = run.artifacts.find(
    (artifact) => artifact.type === "blueprint",
  );
  if (existingBlueprint) {
    return { ok: false, error: "already_ready" };
  }

  const simulationMessages = run.messages.filter((message) =>
    isStoredSimulationAgentRole(message.agentRole),
  );

  if (simulationMessages.length === 0) {
    return { ok: false, error: "generation_failed" };
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
        return { ok: false, error: "budget_exceeded" };
      }
      throw error;
    }
  }

  try {
    await touchRunActivity(runId);

    const artifactOutput = await generateRunArtifacts({
      productIdea: run.userPrompt,
      transcript: mapMessagesToTranscript(simulationMessages),
      roster,
      runSummary: run.summary,
      usageAccumulator: options.usageAccumulator,
      artifactTypes: ["blueprint"],
      onArtifactComplete: async (type, document) => {
        await saveSingleArtifact(runId, type, document);
      },
    });

    const blueprint = artifactOutput.blueprint;
    if (!blueprint) {
      return { ok: false, error: "generation_failed" };
    }

    return {
      ok: true,
      artifacts: { blueprint: blueprint.sections },
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
