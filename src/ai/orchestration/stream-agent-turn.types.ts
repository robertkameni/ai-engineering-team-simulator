import type { getAgentConfig, SimulationAgentRole } from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { DebateTurnContext } from "@/ai/context/build-messages";
import type { TranscriptEntry } from "@/ai/context/transcript";
import type { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";
import type { SimulationStreamEvent } from "@/lib/simulation-stream";

export interface AgentStreamRetryParams {
  readonly runId: string;
  readonly role: SimulationAgentRole;
  readonly productIdea: string;
  readonly transcript: TranscriptEntry[];
  readonly roster: TeamRoster;
  readonly templateId: TeamTemplateId;
  readonly config: ReturnType<typeof getAgentConfig>;
  readonly debateContext?: DebateTurnContext;
  readonly usageAccumulator: RunUsageAccumulator;
  readonly abortSignal?: AbortSignal;
  readonly send: (event: SimulationStreamEvent) => void;
  readonly fullText: string;
}
