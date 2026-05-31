import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  executeRegenerateArtifactsPost,
  type RegenerateArtifactsPostHooks,
} from "../../lib/api/regenerate-artifacts-post-logic.js";
import { getRateLimitThreshold } from "../../lib/rate-limit-config.js";
import type { RateLimitResult } from "../../lib/rate-limit-config.js";

function rateLimitResponse(result: Extract<RateLimitResult, { ok: false }>) {
  return Response.json(
    { error: result.error, retryAfter: result.retryAfterSec },
    {
      status: result.status,
      headers:
        result.status === 429
          ? { "Retry-After": String(result.retryAfterSec) }
          : undefined,
    },
  );
}

describe("getRateLimitThreshold", () => {
  it("sets export_pdf to 5 per hour for authenticated profiles", () => {
    assert.equal(getRateLimitThreshold("export_pdf", true), 5);
  });

  it("sets regenerate to 10 per hour for authenticated profiles", () => {
    assert.equal(getRateLimitThreshold("regenerate", true), 10);
  });

  it("sets regenerate to 3 per hour for guest sessions", () => {
    assert.equal(getRateLimitThreshold("regenerate", false), 3);
  });
});

describe("executeRegenerateArtifactsPost rate limiting", () => {
  it("returns 429 and skips regeneration when rate limit is exceeded", async () => {
    let regenerateCalled = false;

    const hooks: RegenerateArtifactsPostHooks = {
      requireRunAccess: async () => ({
        ok: true,
        run: { id: "run-1", userId: "user-1", guestSessionId: null },
      }),
      assertRateLimit: async () => ({
        ok: false,
        status: 429,
        retryAfterSec: 120,
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
      rateLimitResponse,
    };

    const response = await executeRegenerateArtifactsPost(
      new Request("http://localhost/api/runs/run-1/artifacts"),
      "run-1",
      { userId: "user-1", guestSessionId: null },
      hooks,
    );

    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "120");
    const body = (await response.json()) as { error: string; retryAfter: number };
    assert.equal(body.error, "Rate limit exceeded");
    assert.equal(body.retryAfter, 120);
    assert.equal(regenerateCalled, false);
  });
});
