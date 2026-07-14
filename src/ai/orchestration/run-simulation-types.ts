import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { TranscriptEntry } from "@/ai/context/transcript";
import type { DebateExitOutcome } from "@/ai/orchestration/reviewer-decision";
import type { FocusedOpsFollowUpContext } from "@/ai/orchestration/ops-follow-up";
import type { OpsFollowUpCheckpoint } from "@/lib/db/ops-follow-up-summary";
import type { ReviewIssue } from "@/ai/orchestration/review-issue-tracker";
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
  roleCorrectionCounts: Partial<Record<SimulationAgentRole, number>>;
  transcript: TranscriptEntry[];
  isArchitectRevision: boolean;
  hasTruncatedCriticalTurn: boolean;
  reviewIssues: ReviewIssue[];
  isGateReroute: boolean;
  hasHadEarlyReview: boolean;
  hasHadOpsFollowUpForCurrentReject: boolean;
  focusedOpsFollowUp: FocusedOpsFollowUpContext | null;
  opsFollowUpCheckpoint: OpsFollowUpCheckpoint | null;
  opsFollowUpCheckpoints: OpsFollowUpCheckpoint[];
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
