import type {
  MergeRunSummarySynthesisOptions,
  RunSummaryPayload,
  RunSummarySynthesisTelemetry,
} from "@/lib/db/run-summary.types";
import { parseOpsFollowUpFields } from "@/lib/db/ops-follow-up-summary";

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
  | "openReviewIssueCount"
  | "debateDurationMs"
  | "artifactDurationMs"
  | "userWaitMs"
  | "totalDurationMs"
  | "artifactsPending"
  | "peakPromptTokens"
> {
  return {
    hasTruncatedCriticalTurn: existing?.hasTruncatedCriticalTurn,
    postApproveTruncation: existing?.postApproveTruncation,
    postApproveContinuationFailed: existing?.postApproveContinuationFailed,
    openReviewIssueCount: existing?.openReviewIssueCount,
    debateDurationMs: existing?.debateDurationMs,
    artifactDurationMs: existing?.artifactDurationMs,
    userWaitMs: existing?.userWaitMs,
    totalDurationMs: existing?.totalDurationMs,
    artifactsPending: existing?.artifactsPending,
    peakPromptTokens: existing?.peakPromptTokens,
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
      openReviewIssueCount: optionalNumber(record.openReviewIssueCount),
      debateDurationMs: optionalNullableNumber(record.debateDurationMs),
      artifactDurationMs: optionalNullableNumber(record.artifactDurationMs),
      userWaitMs: optionalNullableNumber(record.userWaitMs),
      totalDurationMs: optionalNullableNumber(record.totalDurationMs),
      artifactsPending: optionalBoolean(record.artifactsPending),
      peakPromptTokens: optionalNullableNumber(record.peakPromptTokens),
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
    ...pickOpsFollowUpFields(existing),
  });
}
