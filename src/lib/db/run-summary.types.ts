import type { DebateExitOutcome } from "@/ai/orchestration/reviewer-decision";

import type { DebateFinalizationTelemetry } from "@/lib/db/debate-finalization-telemetry";
import type {
  OpsFollowUpCheckpoint,
  OpsFollowUpLastCorrectionRole,
} from "@/lib/db/ops-follow-up-summary";

export type RunSummaryDebateOutcome = DebateExitOutcome | "aborted";

export type { OpsFollowUpLastCorrectionRole, DebateFinalizationTelemetry };

export interface ArtifactErrorTelemetry {
  readonly message: string;
  readonly failedArtifact: string | null;
  readonly timestamp: string;
  readonly retryFailed: boolean;
  readonly errorCode?: string;
}

export interface RunSummaryPayloadBase {
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
  /**
   * Authoritative finalization metadata (reason, reject/correction budgets,
   * accepted critical risks, output diagnostics).
   */
  readonly finalization?: DebateFinalizationTelemetry;
  /** Quality tier for approved outcomes (clean / accepted_risks / forced_close). */
  readonly approvalTier?: "clean" | "accepted_risks" | "forced_close";
  /** True when a pre-approval truncation retry still truncated (edge case). */
  readonly truncationRetried?: boolean;
  /** Populated when core artifact synthesis fails after debate. */
  readonly artifactError?: ArtifactErrorTelemetry | null;
  readonly opsFollowUpArchitectCheckpoint?: OpsFollowUpCheckpoint | null;
}

export type RunSummaryPayload = RunSummaryPayloadBase &
  Partial<OpsFollowUpCheckpoint>;

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
