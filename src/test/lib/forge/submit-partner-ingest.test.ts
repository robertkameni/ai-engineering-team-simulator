import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ForgePartnerError } from "../../../lib/forge/forge-handoff-errors.js";
import { submitPartnerIngest } from "../../../lib/forge/submit-partner-ingest.js";

describe("submitPartnerIngest", () => {
  it("returns trackerUrl from a 202 partner response", async () => {
    const result = await submitPartnerIngest({
      markdown: "# Hello",
      sourceFilename: "run.md",
      baseUrl: "https://forge.example",
      partnerSecret: "test-secret-at-least-32-chars-long!!",
      fetchImpl: async (input, init) => {
        assert.equal(String(input), "https://forge.example/api/partner/ingest");
        assert.equal(
          (init?.headers as Record<string, string>).Authorization,
          "Bearer test-secret-at-least-32-chars-long!!",
        );
        assert.equal(init?.method, "POST");
        return new Response(
          JSON.stringify({
            jobId: "550e8400-e29b-41d4-a716-446655440000",
            status: "PENDING",
            statusLabel: "Pending",
            statusUrl:
              "https://forge.example/api/jobs/550e8400-e29b-41d4-a716-446655440000",
            trackerUrl:
              "https://forge.example/?job=550e8400-e29b-41d4-a716-446655440000",
          }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    assert.equal(
      result.trackerUrl,
      "https://forge.example/?job=550e8400-e29b-41d4-a716-446655440000",
    );
    assert.equal(result.jobId, "550e8400-e29b-41d4-a716-446655440000");
  });

  it("throws ForgePartnerError on non-OK responses without leaking the secret", async () => {
    await assert.rejects(
      () =>
        submitPartnerIngest({
          markdown: "# Hello",
          sourceFilename: "run.md",
          baseUrl: "https://forge.example",
          partnerSecret: "test-secret-at-least-32-chars-long!!",
          fetchImpl: async () =>
            new Response(JSON.stringify({ code: "UNAUTHORIZED", message: "nope" }), {
              status: 401,
            }),
        }),
      (error: unknown) => {
        assert.ok(error instanceof ForgePartnerError);
        assert.equal(error.statusCode, 401);
        assert.equal(error.code, "UNAUTHORIZED");
        assert.equal(String(error.message).includes("test-secret"), false);
        return true;
      },
    );
  });
});
