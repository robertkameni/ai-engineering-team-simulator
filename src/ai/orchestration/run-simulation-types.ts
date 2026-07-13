import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { TranscriptEntry } from "@/ai/context/transcript";
import type { DebateExitOutcome } from "@/ai/orchestration/reviewer-decision";
import type { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";
import type { SimulationStreamEvent } from "@/lib/simulation-stream";

export interface RunSimulationOptions {
  userId?: string | null;
  guestSessionId?: string | null;
  usageAccumulator?: RunUsageAccumulator;
  abortSignal?: AbortSignal;
}

export interface RunSimulationResult {
  runId: string;
  usageAccumulator: RunUsageAccumulator;
  debateExitOutcome: DebateExitOutcome;
}

export type TurnDirective =
  | { kind: "break"; outcome: DebateExitOutcome; }
  | { kind: "reroute"; targetRole: SimulationAgentRole; }
  | { kind: "progress"; };

export interface DebateState {
  turnCount: number;
  roleIndex: number;
  returnToReviewer: boolean;
  nextRole: SimulationAgentRole;
  lastRejectFeedback: string | null;
  lastRejectTarget: SimulationAgentRole | null;
  reviewerRejectionCount: number;
  transcript: TranscriptEntry[];
  isArchitectRevision: boolean;
}

export interface TurnContext {
  runId: string;
  productIdea: string;
  roster: TeamRoster;
  templateId: TeamTemplateId;
  usageAccumulator: RunUsageAccumulator;
  abortSignal?: AbortSignal;
  notify: (event: SimulationStreamEvent) => void;
}
