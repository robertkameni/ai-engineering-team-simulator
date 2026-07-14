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
  readonly openReviewIssueCount?: number;
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
