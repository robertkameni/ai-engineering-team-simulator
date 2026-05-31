import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  executeRegenerateArtifactsAction,
  formatRateLimitActionError,
} from "../../features/artifacts/regenerate-artifacts-action-logic.js";
import type { RateLimitResult } from "../../lib/rate-limit-config.js";

describe("executeRegenerateArtifactsAction rate limiting", () => {
  it("returns a serializable error and skips regeneration when rate limit is exceeded", async () => {
    let regenerateCalled = false;

    const result = await executeRegenerateArtifactsAction(
      "run-1",
      { userId: "user-1", guestSessionId: null },
      new Request("http://localhost/regenerate"),
      {
        requireRunAccess: async () => ({
          ok: true,
          run: { id: "run-1", userId: "user-1", guestSessionId: null },
        }),
        assertRateLimit: async (): Promise<RateLimitResult> => ({
          ok: false,
          status: 429,
          retryAfterSec: 90,
          error: "Rate limit exceeded",
        }),
        regenerateRunArtifactsWithUsage: async () => {
          regenerateCalled = true;
          return {
            ok: true,
            artifacts: {
              requirements: [],
              architecture: [],
              implementation: [],
              review: [],
            },
          };
        },
      },
    );

    assert.equal(result.success, false);
    assert.equal(
      result.error,
      formatRateLimitActionError(90),
    );
    assert.equal(regenerateCalled, false);
  });

  it("invokes regeneration when access and rate limit succeed", async () => {
    let regenerateCalled = false;

    const result = await executeRegenerateArtifactsAction(
      "run-1",
      { userId: "user-1", guestSessionId: null },
      new Request("http://localhost/regenerate"),
      {
        requireRunAccess: async () => ({
          ok: true,
          run: { id: "run-1", userId: "user-1", guestSessionId: null },
        }),
        assertRateLimit: async () => ({ ok: true }),
        regenerateRunArtifactsWithUsage: async () => {
          regenerateCalled = true;
          return {
            ok: true,
            artifacts: {
              requirements: [],
              architecture: [],
              implementation: [],
              review: [],
            },
          };
        },
      },
    );

    assert.equal(result.success, true);
    assert.equal(regenerateCalled, true);
  });
});
