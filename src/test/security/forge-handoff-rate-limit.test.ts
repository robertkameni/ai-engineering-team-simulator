import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { rateLimitResponse } from "@/lib/rate-limit-response";

import { executeForgeHandoffPost } from "../../lib/api/forge-handoff-logic.js";

describe("executeForgeHandoffPost rate limiting", () => {
  it("returns 429 and skips Forge when rate limit is exceeded", async () => {
    let forgeCalled = false;

    const response = await executeForgeHandoffPost(
      new Request("http://localhost/api/runs/run-1/forge-handoff", { method: "POST" }),
      "run-1",
      {
        requireAuthenticatedUserId: async () => ({ ok: true as const, userId: "user-1" }),
        assertRateLimit: async () => ({
          ok: false as const,
          status: 429 as const,
          retryAfterSec: 60,
          error: "Rate limit exceeded",
        }),
        rateLimitResponse,
        getOwnedRun: async () => null,
        getTeamRosterTemplateId: async () => null,
        canExportApprovedRun: () => true,
        buildMarkdown: () => "",
        buildFilename: () => "x.md",
        getForgeConfig: () => null,
        submitPartnerIngest: async () => {
          forgeCalled = true;
          return { jobId: "x", trackerUrl: "https://forge.example/?job=x" };
        },
      },
    );

    assert.equal(response.status, 429);
    assert.equal(forgeCalled, false);
  });
});
