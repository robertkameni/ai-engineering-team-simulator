import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  executeRegenerateArtifactsPost,
  type RegenerateArtifactsPostHooks,
} from "../../lib/api/regenerate-artifacts-post-logic.js";
import { rateLimitResponse } from "../shared/rate-limit-response.js";

function baseHooks(
  overrides: Partial<RegenerateArtifactsPostHooks>,
): RegenerateArtifactsPostHooks {
  return {
    requireRunAccess: async () => ({
      ok: true,
      run: { id: "run-a", userId: "user-a", guestSessionId: null },
    }),
    assertRateLimit: async () => ({ ok: true }),
    regenerateRunArtifactsWithUsage: async () => ({
      ok: true,
      artifactDurationMs: null,
      artifacts: {
        requirements: [],
        architecture: [],
        blueprint: [],
        implementation: [],
        review: [],
      },
    }),
    rateLimitResponse,
    ...overrides,
  };
}

describe("regenerateRunArtifacts tenant enclosure", () => {
  it("returns 404 and skips regeneration when route access is forbidden", async () => {
    let regenerateCalled = false;

    const response = await executeRegenerateArtifactsPost(
      new Request("http://localhost/api/runs/run-a/artifacts"),
      "run-a",
      { userId: "user-b", guestSessionId: null },
      baseHooks({
        requireRunAccess: async () => ({ ok: false, reason: "forbidden" }),
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
      }),
    );

    assert.equal(response.status, 404);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, "Run not found");
    assert.equal(regenerateCalled, false);
  });

  it("returns 404 when core regeneration reports forbidden", async () => {
    let generateCalled = false;

    const response = await executeRegenerateArtifactsPost(
      new Request("http://localhost/api/runs/run-a/artifacts"),
      "run-a",
      { userId: "user-a", guestSessionId: null },
      baseHooks({
        regenerateRunArtifactsWithUsage: async () => {
          generateCalled = true;
          return { ok: false, error: "forbidden" };
        },
      }),
    );

    assert.equal(response.status, 404);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, "Run not found");
    assert.equal(generateCalled, true);
  });

  it("forwards scope into regenerateRunArtifactsWithUsage", async () => {
    let capturedScope: { userId: string | null; guestSessionId: string | null } | null =
      null;

    await executeRegenerateArtifactsPost(
      new Request("http://localhost/api/runs/run-a/artifacts"),
      "run-a",
      { userId: "user-a", guestSessionId: "guest-1" },
      baseHooks({
        regenerateRunArtifactsWithUsage: async (_runId, scope) => {
          capturedScope = scope;
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
      }),
    );

    assert.deepEqual(capturedScope, {
      userId: "user-a",
      guestSessionId: "guest-1",
    });
  });
});
