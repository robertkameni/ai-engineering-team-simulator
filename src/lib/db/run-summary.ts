import type {
  MergeRunSummarySynthesisOptions,
  RunSummaryPayload,
  RunSummarySynthesisTelemetry,
} from "@/lib/db/run-summary.types";
import { parseDebateFinalizationTelemetry } from "@/lib/db/debate-finalization-telemetry";
import { parseOpsFollowUpFields } from "@/lib/db/ops-follow-up-summary";
import type { ArtifactErrorTelemetry } from "@/lib/db/run-summary.types";

export const RUN_SUMMARY_SYNTHESIS_VERSION = 2;

const VALID_DEBATE_OUTCOMES = new Set<string>([
  "approved",
  "cap_reached",
  "unknown_reject_fallback",
  "reviewer_error",
  "degraded_truncated",
  "insufficient_budget",
  "aborted",
]);

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalNullableNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  return optionalNumber(value);
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function parseArtifactErrorTelemetry(
  value: unknown,
): ArtifactErrorTelemetry | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.message !== "string" || typeof record.timestamp !== "string") {
    return undefined;
  }
  return {
    message: record.message,
    failedArtifact:
      typeof record.failedArtifact === "string" || record.failedArtifact === null
        ? (record.failedArtifact as string | null)
        : null,
    timestamp: record.timestamp,
    retryFailed: record.retryFailed === true,
    errorCode:
      typeof record.errorCode === "string" ? record.errorCode : undefined,
  };
}

export function buildRunSummaryPayload(payload: RunSummaryPayload): string {
  return JSON.stringify(payload);
}

function pickOpsFollowUpFields(
  existing: RunSummaryPayload | null,
): Pick<
  RunSummaryPayload,
  | "opsFollowUpEvaluated"
  | "opsFollowUpTriggered"
  | "opsFollowUpSkipReason"
  | "opsFollowUpEligible"
  | "opsFollowUpUnresolvedDevopsIssueCount"
  | "opsFollowUpOpenIssueCount"
  | "opsFollowUpAddressedIssueCount"
  | "opsFollowUpAcceptedRiskIssueCount"
  | "opsFollowUpAcceptedRiskReasons"
  | "opsFollowUpLastCorrectionRole"
  | "opsFollowUpEvaluationTurn"
  | "opsFollowUpArchitectCheckpoint"
> {
  return {
    opsFollowUpEvaluated: existing?.opsFollowUpEvaluated,
    opsFollowUpTriggered: existing?.opsFollowUpTriggered,
    opsFollowUpSkipReason: existing?.opsFollowUpSkipReason,
    opsFollowUpEligible: existing?.opsFollowUpEligible,
    opsFollowUpUnresolvedDevopsIssueCount:
      existing?.opsFollowUpUnresolvedDevopsIssueCount,
    opsFollowUpOpenIssueCount: existing?.opsFollowUpOpenIssueCount,
    opsFollowUpAddressedIssueCount: existing?.opsFollowUpAddressedIssueCount,
    opsFollowUpAcceptedRiskIssueCount: existing?.opsFollowUpAcceptedRiskIssueCount,
    opsFollowUpAcceptedRiskReasons: existing?.opsFollowUpAcceptedRiskReasons,
    opsFollowUpLastCorrectionRole: existing?.opsFollowUpLastCorrectionRole,
    opsFollowUpEvaluationTurn: existing?.opsFollowUpEvaluationTurn,
    opsFollowUpArchitectCheckpoint: existing?.opsFollowUpArchitectCheckpoint,
  };
}

function pickPreservedDebateFields(
  existing: RunSummaryPayload | null,
): Pick<
  RunSummaryPayload,
  | "hasTruncatedCriticalTurn"
  | "postApproveTruncation"
  | "postApproveContinuationFailed"
  | "correctionLoopDetected"
  | "openReviewIssueCount"
  | "debateDurationMs"
  | "artifactDurationMs"
  | "userWaitMs"
  | "totalDurationMs"
  | "artifactsPending"
  | "peakPromptTokens"
  | "finalization"
  | "artifactError"
> {
  return {
    hasTruncatedCriticalTurn: existing?.hasTruncatedCriticalTurn,
    postApproveTruncation: existing?.postApproveTruncation,
    postApproveContinuationFailed: existing?.postApproveContinuationFailed,
    correctionLoopDetected: existing?.correctionLoopDetected,
    openReviewIssueCount: existing?.openReviewIssueCount,
    debateDurationMs: existing?.debateDurationMs,
    artifactDurationMs: existing?.artifactDurationMs,
    userWaitMs: existing?.userWaitMs,
    totalDurationMs: existing?.totalDurationMs,
    artifactsPending: existing?.artifactsPending,
    peakPromptTokens: existing?.peakPromptTokens,
    finalization: existing?.finalization,
    artifactError: existing?.artifactError,
  };
}

function resolveTimingField(
  next: number | null | undefined,
  existing: number | null | undefined,
): number | null {
  return next !== undefined ? next : (existing ?? null);
}

function resolveAccumulatedFlag(
  shouldAccumulate: boolean,
  existing: boolean | undefined,
  next: boolean | undefined,
): boolean | undefined {
  if (!shouldAccumulate) {
    return next;
  }
  return existing === true || next === true;
}

export function parseRunSummary(summary: string | null): RunSummaryPayload | null {
  if (!summary?.trim()) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(summary);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    const debateOutcome =
      typeof record.debateOutcome === "string" &&
        VALID_DEBATE_OUTCOMES.has(record.debateOutcome)
        ? (record.debateOutcome as RunSummaryPayload["debateOutcome"])
        : null;

    const turnCount =
      typeof record.turnCount === "number" ? record.turnCount : null;

    const opsFollowUpFields = parseOpsFollowUpFields(record);

    return {
      debateOutcome,
      turnCount,
      synthesisVersion: optionalNumber(record.synthesisVersion),
      consistencyRetries: optionalNumber(record.consistencyRetries),
      stackValidationFailed: optionalBoolean(record.stackValidationFailed),
      crossValidationFailed: optionalBoolean(record.crossValidationFailed),
      hasTruncatedCriticalTurn: optionalBoolean(record.hasTruncatedCriticalTurn),
      postApproveTruncation: optionalBoolean(record.postApproveTruncation),
      postApproveContinuationFailed: optionalBoolean(
        record.postApproveContinuationFailed,
      ),
      correctionLoopDetected: optionalBoolean(record.correctionLoopDetected),
      openReviewIssueCount: optionalNumber(record.openReviewIssueCount),
      debateDurationMs: optionalNullableNumber(record.debateDurationMs),
      artifactDurationMs: optionalNullableNumber(record.artifactDurationMs),
      userWaitMs: optionalNullableNumber(record.userWaitMs),
      totalDurationMs: optionalNullableNumber(record.totalDurationMs),
      artifactsPending: optionalBoolean(record.artifactsPending),
      peakPromptTokens: optionalNullableNumber(record.peakPromptTokens),
      ...(() => {
        const finalization = parseDebateFinalizationTelemetry(record.finalization);
        return finalization ? { finalization } : {};
      })(),
      ...(() => {
        const artifactError = parseArtifactErrorTelemetry(record.artifactError);
        return artifactError !== undefined ? { artifactError } : {};
      })(),
      ...opsFollowUpFields,
    };
  } catch {
    return null;
  }
}

export function mergeRunSummarySynthesisTelemetry(
  existingSummary: string | null,
  telemetry: RunSummarySynthesisTelemetry,
  options?: MergeRunSummarySynthesisOptions,
): string {
  const existing = parseRunSummary(existingSummary);
  const shouldAccumulateFailures = options?.accumulateValidationFailures === true;
  const shouldAccumulateRetries = options?.accumulateRetries === true;

  const consistencyRetries = shouldAccumulateRetries
    ? (existing?.consistencyRetries ?? 0) + telemetry.consistencyRetries
    : telemetry.consistencyRetries;

  return buildRunSummaryPayload({
    debateOutcome: existing?.debateOutcome ?? null,
    turnCount: existing?.turnCount ?? null,
    synthesisVersion: telemetry.synthesisVersion,
    consistencyRetries,
    stackValidationFailed: resolveAccumulatedFlag(
      shouldAccumulateFailures,
      existing?.stackValidationFailed,
      telemetry.stackValidationFailed,
    ),
    crossValidationFailed: resolveAccumulatedFlag(
      shouldAccumulateFailures,
      existing?.crossValidationFailed,
      telemetry.crossValidationFailed,
    ),
    ...pickPreservedDebateFields(existing),
    ...pickOpsFollowUpFields(existing),
  });
}

/** Recompute totalDurationMs so it includes debate + artifact phases. */
export function computeTotalDurationMs(params: {
  readonly debateDurationMs: number | null | undefined;
  readonly artifactDurationMs: number | null | undefined;
}): number | null {
  const debate = params.debateDurationMs;
  const artifacts = params.artifactDurationMs;
  if (debate == null && artifacts == null) {
    return null;
  }
  return (debate ?? 0) + (artifacts ?? 0);
}

/**
 * User-experienced wait from run start until debate and artifacts are both
 * ready. Must never equal artifactDurationMs alone when debate time exists.
 */
export function computeUserWaitMs(params: {
  readonly debateDurationMs: number | null | undefined;
  readonly artifactDurationMs: number | null | undefined;
}): number | null {
  return computeTotalDurationMs(params);
}

/** Merge duration / peak-prompt telemetry into an existing summary JSON. */
export function mergeRunSummaryTimingTelemetry(
  existingSummary: string | null,
  timing: {
    readonly debateDurationMs?: number | null;
    readonly artifactDurationMs?: number | null;
    readonly userWaitMs?: number | null;
    readonly totalDurationMs?: number | null;
    readonly artifactsPending?: boolean;
    readonly peakPromptTokens?: number | null;
    readonly postApproveTruncation?: boolean;
    readonly postApproveContinuationFailed?: boolean;
    readonly artifactError?: ArtifactErrorTelemetry | null;
  },
): string {
  const existing = parseRunSummary(existingSummary);

  return buildRunSummaryPayload({
    debateOutcome: existing?.debateOutcome ?? null,
    turnCount: existing?.turnCount ?? null,
    synthesisVersion: existing?.synthesisVersion,
    consistencyRetries: existing?.consistencyRetries,
    stackValidationFailed: existing?.stackValidationFailed,
    crossValidationFailed: existing?.crossValidationFailed,
    hasTruncatedCriticalTurn: existing?.hasTruncatedCriticalTurn,
    postApproveTruncation:
      timing.postApproveTruncation ?? existing?.postApproveTruncation,
    postApproveContinuationFailed:
      timing.postApproveContinuationFailed ??
      existing?.postApproveContinuationFailed,
    openReviewIssueCount: existing?.openReviewIssueCount,
    debateDurationMs: resolveTimingField(
      timing.debateDurationMs,
      existing?.debateDurationMs,
    ),
    artifactDurationMs: resolveTimingField(
      timing.artifactDurationMs,
      existing?.artifactDurationMs,
    ),
    userWaitMs: resolveTimingField(timing.userWaitMs, existing?.userWaitMs),
    totalDurationMs: resolveTimingField(
      timing.totalDurationMs,
      existing?.totalDurationMs,
    ),
    artifactsPending:
      timing.artifactsPending !== undefined
        ? timing.artifactsPending
        : existing?.artifactsPending,
    peakPromptTokens: resolveTimingField(
      timing.peakPromptTokens,
      existing?.peakPromptTokens,
    ),
    correctionLoopDetected: existing?.correctionLoopDetected,
    finalization: existing?.finalization,
    artifactError:
      timing.artifactError !== undefined
        ? timing.artifactError
        : existing?.artifactError,
    ...pickOpsFollowUpFields(existing),
  });
}
