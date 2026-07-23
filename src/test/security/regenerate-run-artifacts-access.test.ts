import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  executeRegenerateArtifactsPost,
  type RegenerateArtifactsPostHooks,
} from "../../lib/api/regenerate-artifacts-post-logic.js";
import { rateLimitResponse } from "@/lib/rate-limit-response";

const EMPTY_ARTIFACTS = {
  requirements: [],
  architecture: [],
  blueprint: [],
  implementation: [],
  review: [],
} as const;

const SUCCESS_RESULT = {
  ok: true as const,
  artifactDurationMs: null,
  artifacts: EMPTY_ARTIFACTS,
};

function baseHooks(
  overrides: Partial<RegenerateArtifactsPostHooks>,
): RegenerateArtifactsPostHooks {
  return {
    requireRunAccess: async () => ({
      ok: true,
      run: { id: "run-a", userId: "user-a", guestSessionId: null },
    }),
    assertRateLimit: async () => ({ ok: true }),
    regenerateRunArtifactsWithUsage: async () => SUCCESS_RESULT,
    rateLimitResponse,
    ...overrides,
  };
}

async function postRegenerate(
  scope: { userId: string | null; guestSessionId: string | null },
  hooks: Partial<RegenerateArtifactsPostHooks>,
) {
  return executeRegenerateArtifactsPost(
    new Request("http://localhost/api/runs/run-a/artifacts"),
    "run-a",
    scope,
    baseHooks(hooks),
  );
}

describe("regenerateRunArtifacts tenant enclosure — access denied", () => {
  it("returns 404 and skips regeneration when route access is forbidden", async () => {
    let regenerateCalled = false;

    const response = await postRegenerate(
      { userId: "user-b", guestSessionId: null },
      {
        requireRunAccess: async () => ({ ok: false, reason: "forbidden" }),
        regenerateRunArtifactsWithUsage: async () => {
          regenerateCalled = true;
          return SUCCESS_RESULT;
        },
      },
    );

    assert.equal(response.status, 404);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, "Run not found");
    assert.equal(regenerateCalled, false);
  });

  it("returns 404 when core regeneration reports forbidden", async () => {
    let generateCalled = false;

    const response = await postRegenerate(
      { userId: "user-a", guestSessionId: null },
      {
        regenerateRunArtifactsWithUsage: async () => {
          generateCalled = true;
          return { ok: false, error: "forbidden" };
        },
      },
    );

    assert.equal(response.status, 404);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, "Run not found");
    assert.equal(generateCalled, true);
  });
});

describe("regenerateRunArtifacts tenant enclosure — scope", () => {
  it("forwards scope into regenerateRunArtifactsWithUsage", async () => {
    let capturedScope: { userId: string | null; guestSessionId: string | null } | null =
      null;

    await postRegenerate(
      { userId: "user-a", guestSessionId: "guest-1" },
      {
        regenerateRunArtifactsWithUsage: async (_runId, scope) => {
          capturedScope = scope;
          return SUCCESS_RESULT;
        },
      },
    );

    assert.deepEqual(capturedScope, {
      userId: "user-a",
      guestSessionId: "guest-1",
    });
  });
});
