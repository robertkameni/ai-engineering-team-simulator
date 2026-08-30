import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isRetryableArtifactsFailure } from "@/features/simulation/is-retryable-artifacts-failure";

describe("isRetryableArtifactsFailure", () => {
  it("retries a Next.js HTML 404 (Turbopack route miss)", () => {
    assert.equal(
      isRetryableArtifactsFailure(404, "text/html; charset=utf-8"),
      true,
    );
  });

  it("does not retry our JSON run-not-found 404", () => {
    assert.equal(
      isRetryableArtifactsFailure(404, "application/json"),
      false,
    );
  });

  it("retries gateway and rate-limit statuses", () => {
    assert.equal(isRetryableArtifactsFailure(429, "application/json"), true);
    assert.equal(isRetryableArtifactsFailure(503, "text/plain"), true);
  });

  it("does not retry a 404 with no content type", () => {
    assert.equal(isRetryableArtifactsFailure(404, null), false);
  });
});
