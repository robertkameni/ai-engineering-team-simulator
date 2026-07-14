import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildRunSummaryPayload,
  mergeRunSummarySynthesisTelemetry,
  parseRunSummary,
  RUN_SUMMARY_SYNTHESIS_VERSION,
} from "@/lib/db/run-summary";

describe("run summary helpers", () => {
  it("builds and parses debate-only summary payloads", () => {
    const summary = buildRunSummaryPayload({
      debateOutcome: "approved",
      turnCount: 12,
    });

    const parsed = parseRunSummary(summary);

    assert.deepEqual(parsed, {
      debateOutcome: "approved",
      turnCount: 12,
      synthesisVersion: undefined,
      consistencyRetries: undefined,
      stackValidationFailed: undefined,
      crossValidationFailed: undefined,
      hasTruncatedCriticalTurn: undefined,
      openReviewIssueCount: undefined,
    });
  });

  it("merges synthesis telemetry without dropping debate fields", () => {
    const existing = buildRunSummaryPayload({
      debateOutcome: "cap_reached",
      turnCount: 16,
    });

    const merged = mergeRunSummarySynthesisTelemetry(existing, {
      synthesisVersion: RUN_SUMMARY_SYNTHESIS_VERSION,
      consistencyRetries: 1,
      stackValidationFailed: true,
      crossValidationFailed: true,
    });

    assert.deepEqual(parseRunSummary(merged), {
      debateOutcome: "cap_reached",
      turnCount: 16,
      synthesisVersion: RUN_SUMMARY_SYNTHESIS_VERSION,
      consistencyRetries: 1,
      stackValidationFailed: true,
      crossValidationFailed: true,
      hasTruncatedCriticalTurn: undefined,
      openReviewIssueCount: undefined,
    });
  });

  it("accumulates validation failures and retries for partial synthesis", () => {
    const existing = buildRunSummaryPayload({
      debateOutcome: "approved",
      turnCount: 12,
      synthesisVersion: RUN_SUMMARY_SYNTHESIS_VERSION,
      consistencyRetries: 2,
      stackValidationFailed: false,
      crossValidationFailed: true,
    });

    const merged = mergeRunSummarySynthesisTelemetry(
      existing,
      {
        synthesisVersion: RUN_SUMMARY_SYNTHESIS_VERSION,
        consistencyRetries: 1,
        stackValidationFailed: true,
        crossValidationFailed: false,
      },
      {
        accumulateValidationFailures: true,
        accumulateRetries: true,
      },
    );

    assert.deepEqual(parseRunSummary(merged), {
      debateOutcome: "approved",
      turnCount: 12,
      synthesisVersion: RUN_SUMMARY_SYNTHESIS_VERSION,
      consistencyRetries: 3,
      stackValidationFailed: true,
      crossValidationFailed: true,
      hasTruncatedCriticalTurn: undefined,
      openReviewIssueCount: undefined,
    });
  });
});
