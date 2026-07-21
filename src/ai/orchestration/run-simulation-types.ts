import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { TranscriptEntry } from "@/ai/context/transcript";
import type {
  DebateConvergenceState,
  DebateFinalizationProposal,
  DebatePhase,
  ReviewerTurnProposal,
} from "@/ai/orchestration/debate-convergence-controller";
import type { DebateExitOutcome } from "@/ai/orchestration/reviewer-decision";
import type { FocusedOpsFollowUpContext } from "@/ai/orchestration/ops-follow-up";
import type { OpsFollowUpCheckpoint } from "@/lib/db/ops-follow-up-summary";
import type {
  ReviewIssue,
  ReviewIssueBaseline,
} from "@/ai/orchestration/review-issue-tracker";
import type { SectionDumpDiagnostics } from "@/ai/orchestration/section-dump-normalizer";
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

export interface DebateState extends DebateConvergenceState {
  phase: DebatePhase;
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
  /** True when a critical role's *latest* turn is still truncated. */
  hasTruncatedCriticalTurn: boolean;
  /** Set when reviewer [APPROVE] lands despite truncated critical turns. */
  postApproveTruncation: boolean;
  /** True when pre-approval truncation recovery still left a truncated turn. */
  truncationRetried: boolean;
  /**
   * True when a post-approve truncation recovery turn was attempted and the
   * critical turn remained truncated (or budget blocked a second recovery).
   */
  postApproveContinuationFailed: boolean;
  /**
   * Critical roles already given a post-approve truncation recovery turn.
   * Prevents infinite recovery loops when a retry stays truncated.
   */
  truncationRecoveryAttemptedRoles: SimulationAgentRole[];
  reviewIssues: ReviewIssue[];
  reviewIssueBaseline: ReviewIssueBaseline | null;
  isGateReroute: boolean;
  hasHadEarlyReview: boolean;
  hasHadOpsFollowUpForCurrentReject: boolean;
  focusedOpsFollowUp: FocusedOpsFollowUpContext | null;
  opsFollowUpCheckpoint: OpsFollowUpCheckpoint | null;
  opsFollowUpCheckpoints: OpsFollowUpCheckpoint[];
  /** Consecutive unproductive reject cycles → prefer approve. */
  consecutiveUnproductiveCycles: number;
  correctionLoopDetected: boolean;
  reviewerProposal: ReviewerTurnProposal | null;
  finalizationProposal: DebateFinalizationProposal | null;
  /** Latest section-dump / hard-cap diagnostics from turn persistence. */
  outputDiagnostics: SectionDumpDiagnostics | null;
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
