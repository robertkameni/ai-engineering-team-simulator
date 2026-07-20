import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildRunSummaryPayload,
  mergeRunSummarySynthesisTelemetry,
  parseRunSummary,
  RUN_SUMMARY_SYNTHESIS_VERSION,
} from "@/lib/db/run-summary";

const DEFAULT_OPS_FIELDS = {
  opsFollowUpEvaluated: false,
  opsFollowUpTriggered: false,
  opsFollowUpSkipReason: null,
  opsFollowUpEligible: false,
  opsFollowUpUnresolvedDevopsIssueCount: 0,
  opsFollowUpLastCorrectionRole: null,
  opsFollowUpEvaluationTurn: null,
  opsFollowUpArchitectCheckpoint: null,
} as const;

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
      postApproveTruncation: undefined,
      openReviewIssueCount: undefined,
      debateDurationMs: undefined,
      artifactDurationMs: undefined,
      totalDurationMs: undefined,
      peakPromptTokens: undefined,
      ...DEFAULT_OPS_FIELDS,
    });
  });

  it("parses ops follow-up observability fields from summary payloads", () => {
    const summary = buildRunSummaryPayload({
      debateOutcome: "approved",
      turnCount: 11,
      opsFollowUpEvaluated: true,
      opsFollowUpTriggered: true,
      opsFollowUpSkipReason: null,
      opsFollowUpEligible: true,
      opsFollowUpUnresolvedDevopsIssueCount: 2,
      opsFollowUpLastCorrectionRole: "architect",
      opsFollowUpEvaluationTurn: 11,
    });

    const parsed = parseRunSummary(summary);

    assert.equal(parsed?.opsFollowUpEvaluated, true);
    assert.equal(parsed?.opsFollowUpTriggered, true);
    assert.equal(parsed?.opsFollowUpSkipReason, null);
    assert.equal(parsed?.opsFollowUpEligible, true);
    assert.equal(parsed?.opsFollowUpUnresolvedDevopsIssueCount, 2);
    assert.equal(parsed?.opsFollowUpLastCorrectionRole, "architect");
    assert.equal(parsed?.opsFollowUpEvaluationTurn, 11);
  });

  it("treats legacy triggered-only summaries as evaluated", () => {
    const summary = buildRunSummaryPayload({
      debateOutcome: "approved",
      turnCount: 11,
      opsFollowUpTriggered: true,
    });

    const parsed = parseRunSummary(summary);

    assert.equal(parsed?.opsFollowUpEvaluated, true);
    assert.equal(parsed?.opsFollowUpTriggered, true);
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
      postApproveTruncation: undefined,
      openReviewIssueCount: undefined,
      debateDurationMs: undefined,
      artifactDurationMs: undefined,
      totalDurationMs: undefined,
      peakPromptTokens: undefined,
      ...DEFAULT_OPS_FIELDS,
    });
  });

  it("preserves ops follow-up fields when merging synthesis telemetry", () => {
    const existing = buildRunSummaryPayload({
      debateOutcome: "approved",
      turnCount: 11,
      opsFollowUpEvaluated: true,
      opsFollowUpTriggered: false,
      opsFollowUpSkipReason: "no_unresolved_devops_issues",
      opsFollowUpEligible: false,
      opsFollowUpUnresolvedDevopsIssueCount: 0,
      opsFollowUpLastCorrectionRole: "architect",
      opsFollowUpEvaluationTurn: 11,
    });

    const merged = mergeRunSummarySynthesisTelemetry(existing, {
      synthesisVersion: RUN_SUMMARY_SYNTHESIS_VERSION,
      consistencyRetries: 0,
    });

    const parsed = parseRunSummary(merged);
    assert.equal(parsed?.opsFollowUpEvaluated, true);
    assert.equal(parsed?.opsFollowUpSkipReason, "no_unresolved_devops_issues");
    assert.equal(parsed?.opsFollowUpLastCorrectionRole, "architect");
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
      postApproveTruncation: undefined,
      openReviewIssueCount: undefined,
      debateDurationMs: undefined,
      artifactDurationMs: undefined,
      totalDurationMs: undefined,
      peakPromptTokens: undefined,
      ...DEFAULT_OPS_FIELDS,
    });
  });
});
