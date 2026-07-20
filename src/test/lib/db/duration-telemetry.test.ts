import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  computeTotalDurationMs,
  computeUserWaitMs,
  mergeRunSummaryTimingTelemetry,
  parseRunSummary,
  buildRunSummaryPayload,
} from "@/lib/db/run-summary";

describe("duration telemetry", () => {
  it("computes totalDurationMs as debate + artifact", () => {
    assert.equal(
      computeTotalDurationMs({
        debateDurationMs: 100_000,
        artifactDurationMs: 40_000,
      }),
      140_000,
    );
  });

  it("computes userWaitMs as debate + artifact (never artifact alone)", () => {
    assert.equal(
      computeUserWaitMs({
        debateDurationMs: 100_000,
        artifactDurationMs: 40_000,
      }),
      140_000,
    );
  });

  it("merges userWaitMs, artifactsPending, and recomputed total after synthesis", () => {
    const provisional = buildRunSummaryPayload({
      debateOutcome: "approved",
      turnCount: 12,
      debateDurationMs: 100_000,
      artifactDurationMs: null,
      userWaitMs: null,
      totalDurationMs: 100_000,
      artifactsPending: true,
    });

    const merged = mergeRunSummaryTimingTelemetry(provisional, {
      artifactDurationMs: 45_000,
      userWaitMs: computeUserWaitMs({
        debateDurationMs: 100_000,
        artifactDurationMs: 45_000,
      }),
      totalDurationMs: computeTotalDurationMs({
        debateDurationMs: 100_000,
        artifactDurationMs: 45_000,
      }),
      artifactsPending: false,
    });

    const parsed = parseRunSummary(merged);
    assert.equal(parsed?.debateDurationMs, 100_000);
    assert.equal(parsed?.artifactDurationMs, 45_000);
    assert.equal(parsed?.userWaitMs, 145_000);
    assert.equal(parsed?.totalDurationMs, 145_000);
    assert.equal(parsed?.artifactsPending, false);
  });

  it("keeps artifactDurationMs on failure-shaped timing merges", () => {
    const base = buildRunSummaryPayload({
      debateOutcome: "approved",
      turnCount: 8,
      debateDurationMs: 90_000,
      artifactsPending: true,
      totalDurationMs: 90_000,
    });

    const failed = mergeRunSummaryTimingTelemetry(base, {
      artifactDurationMs: 906,
      userWaitMs: computeUserWaitMs({
        debateDurationMs: 90_000,
        artifactDurationMs: 906,
      }),
      totalDurationMs: computeTotalDurationMs({
        debateDurationMs: 90_000,
        artifactDurationMs: 906,
      }),
      artifactsPending: false,
    });

    const parsed = parseRunSummary(failed);
    assert.equal(parsed?.artifactDurationMs, 906);
    assert.equal(parsed?.userWaitMs, 90_906);
    assert.equal(parsed?.totalDurationMs, 90_906);
    assert.equal(parsed?.artifactsPending, false);
  });
});
