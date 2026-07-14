import type { DebateExitOutcome } from "@/ai/orchestration/reviewer-decision";

export type RunSummaryDebateOutcome = DebateExitOutcome | "aborted";

export interface RunSummaryPayload {
  readonly debateOutcome: RunSummaryDebateOutcome | null;
  readonly turnCount: number | null;
  readonly synthesisVersion?: number;
  readonly consistencyRetries?: number;
  readonly stackValidationFailed?: boolean;
  readonly crossValidationFailed?: boolean;
  /** TRUNCATION APPROVAL GUARD — true when a critical-role turn was
   *  truncated and the approval was downgraded to degraded_truncated. */
  readonly hasTruncatedCriticalTurn?: boolean;
  /** Number of open review issues remaining at debate close. */
  readonly openReviewIssueCount?: number;
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
