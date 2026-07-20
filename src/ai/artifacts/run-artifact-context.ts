import "server-only";

import { SIMULATION_AGENT_ORDER } from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";
import { isStoredSimulationAgentRole } from "@/ai/config";
import type { TranscriptEntry } from "@/ai/context/transcript";
import {
  assertSimulationWithinBudget,
  isSimulationBudgetExceeded,
  type SimulationBudgetExceededError,
} from "@/ai/orchestration/simulation-budget";
import type { AgentRole } from "@/features/agents/types";
import { getPersonaBase } from "@/features/agents/personas";
import { getTeamRoster, parseTeamRoster, TEAM_ROSTER_ARTIFACT_TYPE } from "@/lib/db/team-roster";
import type { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";

export type StoredSimulationMessage = {
  readonly agentRole: string;
  readonly agentName: string | null;
  readonly content: string;
};

export type StoredMessageWithRole = Pick<
  StoredSimulationMessage,
  "agentRole" | "agentName"
>;

function filterSimulationMessages<
  T extends { agentRole: string },
>(messages: readonly T[]): T[] {
  return messages.filter((message) =>
    isStoredSimulationAgentRole(message.agentRole),
  );
}

function buildRosterFromMessages(
  messages: readonly StoredMessageWithRole[],
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

export function mapMessagesToTranscript(
  messages: readonly StoredSimulationMessage[],
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

async function resolveTeamRosterForRun(
  runId: string,
  rosterArtifactData: unknown,
  simulationMessages: readonly StoredMessageWithRole[],
): Promise<TeamRoster> {
  return (
    parseTeamRoster(rosterArtifactData) ??
    (await getTeamRoster(runId)) ??
    buildRosterFromMessages(simulationMessages)
  );
}

export type BudgetCheckResult =
  | { ok: true }
  | {
      ok: false;
      error: "budget_exceeded";
      budgetError: SimulationBudgetExceededError;
    };

function checkArtifactGenerationBudget(
  usageAccumulator: RunUsageAccumulator | undefined,
): BudgetCheckResult {
  if (!usageAccumulator) {
    return { ok: true };
  }

  try {
    assertSimulationWithinBudget(usageAccumulator);
    return { ok: true };
  } catch (error) {
    if (isSimulationBudgetExceeded(error)) {
      return { ok: false, error: "budget_exceeded", budgetError: error };
    }
    throw error;
  }
}

export type ArtifactGenerationPrepResult<TMessage extends StoredSimulationMessage> =
  | {
      ok: true;
      simulationMessages: TMessage[];
      roster: TeamRoster;
    }
  | { ok: false; error: "generation_failed" | "budget_exceeded" };

/**
 * Shared prep for blueprint + regenerate: filter simulation messages,
 * resolve roster, and enforce the per-run budget ceiling.
 */
export async function prepareArtifactGenerationContext<
  TMessage extends StoredSimulationMessage,
>(params: {
  readonly runId: string;
  readonly messages: readonly TMessage[];
  readonly artifacts: readonly { readonly type: string; readonly data: unknown }[];
  readonly usageAccumulator?: RunUsageAccumulator;
  readonly logBudgetExceeded?: boolean;
}): Promise<ArtifactGenerationPrepResult<TMessage>> {
  const simulationMessages = filterSimulationMessages(params.messages);
  if (simulationMessages.length === 0) {
    return { ok: false, error: "generation_failed" };
  }

  const rosterArtifact = params.artifacts.find(
    (artifact) => artifact.type === TEAM_ROSTER_ARTIFACT_TYPE,
  );
  const roster = await resolveTeamRosterForRun(
    params.runId,
    rosterArtifact?.data,
    simulationMessages,
  );

  const budgetCheck = checkArtifactGenerationBudget(params.usageAccumulator);
  if (!budgetCheck.ok) {
    if (params.logBudgetExceeded) {
      console.warn("Regenerate artifacts: budget exceeded before generation", {
        runId: params.runId,
        estimatedCostUsd: budgetCheck.budgetError.estimatedCostUsd,
        maxCostUsd: budgetCheck.budgetError.maxCostUsd,
      });
    }
    return { ok: false, error: budgetCheck.error };
  }

  return { ok: true, simulationMessages, roster };
}
