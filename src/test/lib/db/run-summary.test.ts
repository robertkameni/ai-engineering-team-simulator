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
    });

    assert.deepEqual(parseRunSummary(merged), {
      debateOutcome: "cap_reached",
      turnCount: 16,
      synthesisVersion: RUN_SUMMARY_SYNTHESIS_VERSION,
      consistencyRetries: 1,
      stackValidationFailed: true,
    });
  });
});
