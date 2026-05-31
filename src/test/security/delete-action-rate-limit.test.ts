import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  executeDeleteRunAction,
  type DeleteRunActionHooks,
} from "../../features/workspace/delete-run-action-logic.js";
import type { RateLimitResult } from "../../lib/rate-limit-config.js";

describe("executeDeleteRunAction rate limiting", () => {
  it("returns rate_limited and skips delete when rate limit is exceeded", async () => {
    let deleteCalled = false;

    const hooks: DeleteRunActionHooks = {
      assertRateLimit: async (): Promise<RateLimitResult> => ({
        ok: false,
        status: 429,
        retryAfterSec: 120,
        error: "Rate limit exceeded",
      }),
      deleteRunIfOwned: async () => {
        deleteCalled = true;
        return "deleted";
      },
    };

    const result = await executeDeleteRunAction(
      "run-1",
      "/workspace",
      { userId: "user-1", guestSessionId: null },
      new Request("http://localhost/delete"),
      hooks,
    );

    assert.equal(result.ok, false);
    if (result.ok) assert.fail("expected failure");
    assert.equal(result.reason, "rate_limited");
    assert.equal(result.retryAfterSec, 120);
    assert.equal(deleteCalled, false);
  });

  it("invokes delete when access and rate limit succeed", async () => {
    let deleteCalled = false;

    const result = await executeDeleteRunAction(
      "run-1",
      "/runs/run-1",
      { userId: "user-1", guestSessionId: null },
      new Request("http://localhost/delete"),
      {
        assertRateLimit: async () => ({ ok: true }),
        deleteRunIfOwned: async () => {
          deleteCalled = true;
          return "deleted";
        },
      },
    );

    assert.equal(result.ok, true);
    if (!result.ok) assert.fail("expected success");
    assert.equal(result.deleted, true);
    assert.equal(result.shouldRedirect, true);
    assert.equal(deleteCalled, true);
  });
});
