import type { DebateExitOutcome } from "@/ai/orchestration/reviewer-decision";

import type {
  OpsFollowUpCheckpoint,
  OpsFollowUpLastCorrectionRole,
} from "@/lib/db/ops-follow-up-summary";

export type RunSummaryDebateOutcome = DebateExitOutcome | "aborted";

export type { OpsFollowUpLastCorrectionRole };

export interface RunSummaryPayload {
  readonly debateOutcome: RunSummaryDebateOutcome | null;
  readonly turnCount: number | null;
  readonly synthesisVersion?: number;
  readonly consistencyRetries?: number;
  readonly stackValidationFailed?: boolean;
  readonly crossValidationFailed?: boolean;
  readonly hasTruncatedCriticalTurn?: boolean;
  /** Reviewer approved despite truncated critical turns — warning only. */
  readonly postApproveTruncation?: boolean;
  readonly openReviewIssueCount?: number;
  readonly debateDurationMs?: number | null;
  readonly artifactDurationMs?: number | null;
  /**
   * User-experienced wait from run start until debate + artifacts are ready
   * (≈ debateDurationMs + artifactDurationMs). Never artifact time alone.
   */
  readonly userWaitMs?: number | null;
  /** True when unproductive reject→correct cycles forced prefer-approve. */
  readonly correctionLoopDetected?: boolean;
  /**
   * Debate + artifact phases. Provisional at debate end (debate only) until
   * synthesis settles and rewrites this to debate + artifact.
   */
  readonly totalDurationMs?: number | null;
  /** True while core artifact synthesis is still in flight. */
  readonly artifactsPending?: boolean;
  /** Post-approve truncation recovery attempted but still truncated. */
  readonly postApproveContinuationFailed?: boolean;
  readonly peakPromptTokens?: number | null;
  readonly opsFollowUpEvaluated?: boolean;
  readonly opsFollowUpTriggered?: boolean;
  readonly opsFollowUpSkipReason?: string | null;
  readonly opsFollowUpEligible?: boolean;
  readonly opsFollowUpUnresolvedDevopsIssueCount?: number;
  readonly opsFollowUpLastCorrectionRole?: OpsFollowUpLastCorrectionRole | null;
  readonly opsFollowUpEvaluationTurn?: number | null;
  readonly opsFollowUpArchitectCheckpoint?: OpsFollowUpCheckpoint | null;
}

export interface RunSummarySynthesisTelemetry {
  readonly synthesisVersion: number;
  readonly consistencyRetries: number;
  readonly stackValidationFailed?: boolean;
  readonly crossValidationFailed?: boolean;
}

export interface MergeRunSummarySynthesisOptions {
  readonly accumulateValidationFailures?: boolean;
  readonly accumulateRetries?: boolean;
}
