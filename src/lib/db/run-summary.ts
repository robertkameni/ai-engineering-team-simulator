import type {
  MergeRunSummarySynthesisOptions,
  RunSummaryPayload,
  RunSummarySynthesisTelemetry,
} from "@/lib/db/run-summary.types";

export const RUN_SUMMARY_SYNTHESIS_VERSION = 2;

const VALID_DEBATE_OUTCOMES = new Set<string>([
  "approved",
  "cap_reached",
  "unknown_reject_fallback",
  "reviewer_error",
  "aborted",
]);

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

    const synthesisVersion =
      typeof record.synthesisVersion === "number"
        ? record.synthesisVersion
        : undefined;

    const consistencyRetries =
      typeof record.consistencyRetries === "number"
        ? record.consistencyRetries
        : undefined;

    const stackValidationFailed =
      typeof record.stackValidationFailed === "boolean"
        ? record.stackValidationFailed
        : undefined;

    const crossValidationFailed =
      typeof record.crossValidationFailed === "boolean"
        ? record.crossValidationFailed
        : undefined;

    return {
      debateOutcome,
      turnCount,
      synthesisVersion,
      consistencyRetries,
      stackValidationFailed,
      crossValidationFailed,
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
  });
}
