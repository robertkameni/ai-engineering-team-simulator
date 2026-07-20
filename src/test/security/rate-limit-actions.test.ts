import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  executeRegenerateArtifactsPost,
  type RegenerateArtifactsPostHooks,
} from "../../lib/api/regenerate-artifacts-post-logic.js";
import { getRateLimitThreshold } from "../../lib/rate-limit-config.js";
import { rateLimitResponse } from "../shared/rate-limit-response.js";

describe("getRateLimitThreshold", () => {
  it("sets export_pdf to default 5 when env is unset", () => {
    const saved = process.env.RATE_LIMIT_EXPORT_PDF_AUTH;
    delete process.env.RATE_LIMIT_EXPORT_PDF_AUTH;
    try {
      assert.equal(getRateLimitThreshold("export_pdf", true), 5);
    } finally {
      if (saved !== undefined) process.env.RATE_LIMIT_EXPORT_PDF_AUTH = saved;
    }
  });

  it("sets regenerate to default 10 for authenticated profiles when env is unset", () => {
    const saved = process.env.RATE_LIMIT_REGENERATE_AUTH;
    delete process.env.RATE_LIMIT_REGENERATE_AUTH;
    try {
      assert.equal(getRateLimitThreshold("regenerate", true), 10);
    } finally {
      if (saved !== undefined) process.env.RATE_LIMIT_REGENERATE_AUTH = saved;
    }
  });

  it("sets regenerate to default 3 for guest sessions when env is unset", () => {
    const saved = process.env.RATE_LIMIT_REGENERATE_GUEST;
    delete process.env.RATE_LIMIT_REGENERATE_GUEST;
    try {
      assert.equal(getRateLimitThreshold("regenerate", false), 3);
    } finally {
      if (saved !== undefined) process.env.RATE_LIMIT_REGENERATE_GUEST = saved;
    }
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
          artifactDurationMs: null,
          artifacts: {
            requirements: [],
            architecture: [],
            blueprint: [],
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
