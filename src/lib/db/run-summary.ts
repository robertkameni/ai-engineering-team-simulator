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
      openReviewIssueCount: optionalNumber(record.openReviewIssueCount),
      debateDurationMs: optionalNullableNumber(record.debateDurationMs),
      artifactDurationMs: optionalNullableNumber(record.artifactDurationMs),
      totalDurationMs: optionalNullableNumber(record.totalDurationMs),
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

  const stackValidationFailed = shouldAccumulateFailures
    ? existing?.stackValidationFailed === true ||
      telemetry.stackValidationFailed === true
    : telemetry.stackValidationFailed;

  const crossValidationFailed = shouldAccumulateFailures
    ? existing?.crossValidationFailed === true ||
      telemetry.crossValidationFailed === true
    : telemetry.crossValidationFailed;

  const consistencyRetries = shouldAccumulateRetries
    ? (existing?.consistencyRetries ?? 0) + telemetry.consistencyRetries
    : telemetry.consistencyRetries;

  return buildRunSummaryPayload({
    debateOutcome: existing?.debateOutcome ?? null,
    turnCount: existing?.turnCount ?? null,
    synthesisVersion: telemetry.synthesisVersion,
    consistencyRetries,
    stackValidationFailed,
    crossValidationFailed,
    hasTruncatedCriticalTurn: existing?.hasTruncatedCriticalTurn,
    postApproveTruncation: existing?.postApproveTruncation,
    openReviewIssueCount: existing?.openReviewIssueCount,
    debateDurationMs: existing?.debateDurationMs,
    artifactDurationMs: existing?.artifactDurationMs,
    totalDurationMs: existing?.totalDurationMs,
    peakPromptTokens: existing?.peakPromptTokens,
    opsFollowUpEvaluated: existing?.opsFollowUpEvaluated,
    opsFollowUpTriggered: existing?.opsFollowUpTriggered,
    opsFollowUpSkipReason: existing?.opsFollowUpSkipReason,
    opsFollowUpEligible: existing?.opsFollowUpEligible,
    opsFollowUpUnresolvedDevopsIssueCount:
      existing?.opsFollowUpUnresolvedDevopsIssueCount,
    opsFollowUpLastCorrectionRole: existing?.opsFollowUpLastCorrectionRole,
    opsFollowUpEvaluationTurn: existing?.opsFollowUpEvaluationTurn,
    opsFollowUpArchitectCheckpoint: existing?.opsFollowUpArchitectCheckpoint,
  });
}

/** Merge duration / peak-prompt telemetry into an existing summary JSON. */
export function mergeRunSummaryTimingTelemetry(
  existingSummary: string | null,
  timing: {
    readonly debateDurationMs?: number | null;
    readonly artifactDurationMs?: number | null;
    readonly totalDurationMs?: number | null;
    readonly peakPromptTokens?: number | null;
    readonly postApproveTruncation?: boolean;
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
    openReviewIssueCount: existing?.openReviewIssueCount,
    debateDurationMs:
      timing.debateDurationMs !== undefined
        ? timing.debateDurationMs
        : (existing?.debateDurationMs ?? null),
    artifactDurationMs:
      timing.artifactDurationMs !== undefined
        ? timing.artifactDurationMs
        : (existing?.artifactDurationMs ?? null),
    totalDurationMs:
      timing.totalDurationMs !== undefined
        ? timing.totalDurationMs
        : (existing?.totalDurationMs ?? null),
    peakPromptTokens:
      timing.peakPromptTokens !== undefined
        ? timing.peakPromptTokens
        : (existing?.peakPromptTokens ?? null),
    opsFollowUpEvaluated: existing?.opsFollowUpEvaluated,
    opsFollowUpTriggered: existing?.opsFollowUpTriggered,
    opsFollowUpSkipReason: existing?.opsFollowUpSkipReason,
    opsFollowUpEligible: existing?.opsFollowUpEligible,
    opsFollowUpUnresolvedDevopsIssueCount:
      existing?.opsFollowUpUnresolvedDevopsIssueCount,
    opsFollowUpLastCorrectionRole: existing?.opsFollowUpLastCorrectionRole,
    opsFollowUpEvaluationTurn: existing?.opsFollowUpEvaluationTurn,
    opsFollowUpArchitectCheckpoint: existing?.opsFollowUpArchitectCheckpoint,
  });
}
