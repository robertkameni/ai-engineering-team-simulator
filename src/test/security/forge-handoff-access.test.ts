import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MockRun } from "@/lib/types";
import { rateLimitResponse } from "@/lib/rate-limit-response";

import {
  executeForgeHandoffPost,
  type ForgeHandoffHooks,
} from "../../lib/api/forge-handoff-logic.js";

function createApprovedRun(): MockRun {
  return {
    id: "run-1",
    title: "Demo",
    userPrompt: "Build a demo",
    status: "complete",
    updatedAt: "2026-09-04T00:00:00.000Z",
    debateOutcome: "approved",
    messages: [
      {
        id: "message-1",
        role: "pm",
        content: "Define the scope.",
        createdAt: "2026-09-04T00:00:00.000Z",
      },
    ],
    artifacts: {
      requirements: [{ title: "Goals", items: ["Capture the requirements"] }],
      architecture: [{ title: "System", items: ["Use a service boundary"] }],
      blueprint: [{ title: "Flow", items: ["Validate before export"] }],
      implementation: [{ title: "Plan", items: ["Ship the POST handler"] }],
      review: [{ title: "Review", items: ["Confirm readiness"] }],
    },
  };
}

function baseHooks(overrides: Partial<ForgeHandoffHooks> = {}): ForgeHandoffHooks {
  return {
    requireAuthenticatedUserId: async () => ({ ok: true as const, userId: "user-1" }),
    assertRateLimit: async () => ({ ok: true as const }),
    rateLimitResponse,
    getOwnedRun: async () => createApprovedRun(),
    getTeamRosterTemplateId: async () => "software",
    canExportApprovedRun: () => true,
    buildMarkdown: () => "# brief\n",
    buildFilename: () => "demo.md",
    getForgeConfig: () => ({
      baseUrl: "https://forge.example",
      partnerSecret: "test-secret-at-least-32-chars-long!!",
    }),
    submitPartnerIngest: async () => ({
      jobId: "550e8400-e29b-41d4-a716-446655440000",
      trackerUrl: "https://forge.example/?job=550e8400-e29b-41d4-a716-446655440000",
    }),
    ...overrides,
  };
}

describe("executeForgeHandoffPost access", () => {
  it("returns 401 when unauthenticated and does not call Forge", async () => {
    let forgeCalled = false;

    const response = await executeForgeHandoffPost(
      new Request("http://localhost/api/runs/run-1/forge-handoff", { method: "POST" }),
      "run-1",
      baseHooks({
        requireAuthenticatedUserId: async () => ({
          ok: false as const,
          response: Response.json(
            { error: "Authentication required to export" },
            { status: 401 },
          ),
        }),
        submitPartnerIngest: async () => {
          forgeCalled = true;
          return { jobId: "x", trackerUrl: "https://forge.example/?job=x" };
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.equal(forgeCalled, false);
  });

  it("returns 404 when the run is missing and does not call Forge", async () => {
    let forgeCalled = false;

    const response = await executeForgeHandoffPost(
      new Request("http://localhost/api/runs/run-1/forge-handoff", { method: "POST" }),
      "run-1",
      baseHooks({
        getOwnedRun: async () => null,
        submitPartnerIngest: async () => {
          forgeCalled = true;
          return { jobId: "x", trackerUrl: "https://forge.example/?job=x" };
        },
      }),
    );

    assert.equal(response.status, 404);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, "Run not found");
    assert.equal(forgeCalled, false);
  });

  it("returns 409 when export gate fails", async () => {
    const response = await executeForgeHandoffPost(
      new Request("http://localhost/api/runs/run-1/forge-handoff", { method: "POST" }),
      "run-1",
      baseHooks({ canExportApprovedRun: () => false }),
    );

    assert.equal(response.status, 409);
  });

  it("returns 503 when Forge config is missing", async () => {
    const response = await executeForgeHandoffPost(
      new Request("http://localhost/api/runs/run-1/forge-handoff", { method: "POST" }),
      "run-1",
      baseHooks({ getForgeConfig: () => null }),
    );

    assert.equal(response.status, 503);
  });

  it("returns 200 with trackerUrl on success", async () => {
    let receivedMarkdown = "";

    const response = await executeForgeHandoffPost(
      new Request("http://localhost/api/runs/run-1/forge-handoff", { method: "POST" }),
      "run-1",
      baseHooks({
        buildMarkdown: () => "# brief\n",
        submitPartnerIngest: async ({ markdown }) => {
          receivedMarkdown = markdown;
          return {
            jobId: "550e8400-e29b-41d4-a716-446655440000",
            trackerUrl: "https://forge.example/?job=550e8400-e29b-41d4-a716-446655440000",
          };
        },
      }),
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as { trackerUrl: string };
    assert.equal(
      body.trackerUrl,
      "https://forge.example/?job=550e8400-e29b-41d4-a716-446655440000",
    );
    assert.equal(receivedMarkdown, "# brief\n");
    assert.equal(receivedMarkdown.includes("<!-- export-id:"), false);
  });
});
