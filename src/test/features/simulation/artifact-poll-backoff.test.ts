import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  computeArtifactPollIntervalMs,
  countArtifactPollIntervalsWithinMs,
  POLL_ARTIFACT_INITIAL_MS,
  POLL_ARTIFACT_MAX_INTERVAL_MS,
} from "@/features/simulation/artifact-poll-backoff";

describe("artifact poll backoff", () => {
  it("starts between 2000–3000ms and grows by 1.5 until the 10s cap", () => {
    assert.equal(POLL_ARTIFACT_INITIAL_MS >= 2000, true);
    assert.equal(POLL_ARTIFACT_INITIAL_MS <= 3000, true);
    assert.equal(computeArtifactPollIntervalMs(0), POLL_ARTIFACT_INITIAL_MS);
    assert.equal(
      computeArtifactPollIntervalMs(1),
      Math.floor(POLL_ARTIFACT_INITIAL_MS * 1.5),
    );
    assert.equal(computeArtifactPollIntervalMs(20), POLL_ARTIFACT_MAX_INTERVAL_MS);
  });

  it("keeps 45s windows at ≤15 polls and 320s windows under 50", () => {
    const polls45s = countArtifactPollIntervalsWithinMs(45_000);
    const polls320s = countArtifactPollIntervalsWithinMs(320_000);

    assert.ok(polls45s <= 15, `expected ≤15 polls in 45s, got ${polls45s}`);
    assert.ok(polls320s < 50, `expected <50 polls in 320s, got ${polls320s}`);
  });
});
