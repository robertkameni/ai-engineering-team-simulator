import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  executeSavedRunPdfExport,
  type SavedRunPdfExportHooks,
} from "../../lib/export/saved-run-pdf-export-logic.js";
import { buildRunStyledMarkdown } from "../../lib/export/build-run-export-document.js";
import { buildRunPdfFilename } from "../../lib/export/export-filename.js";
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

function baseHooks(
  overrides: Partial<SavedRunPdfExportHooks>,
): SavedRunPdfExportHooks {
  return {
    requireRunAccess: async () => ({
      ok: true,
      run: { id: "run-a", userId: "user-a", guestSessionId: null },
    }),
    assertRateLimit: async () => ({ ok: true }),
    getRunForWorkspaceIfOwned: async () => null,
    getTeamRoster: async () => null,
    buildRunStyledMarkdown,
    compileRunPdfFromMarkdown: async () => Buffer.from("pdf"),
    buildRunPdfFilename,
    rateLimitResponse,
    ...overrides,
  };
}

describe("executeSavedRunPdfExport authorization", () => {
  it("returns 403 and skips PDF compilation when access is forbidden", async () => {
    let compileCalled = false;

    const response = await executeSavedRunPdfExport(
      new Request("http://localhost/api/runs/run-a/export/pdf"),
      "run-a",
      "user-b",
      baseHooks({
        requireRunAccess: async () => ({ ok: false, reason: "forbidden" }),
        compileRunPdfFromMarkdown: async () => {
          compileCalled = true;
          return Buffer.from("pdf");
        },
      }),
    );

    assert.equal(response.status, 403);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, "Forbidden");
    assert.equal(compileCalled, false);
  });

  it("returns 404 and skips PDF compilation when run is not found in access check", async () => {
    let compileCalled = false;

    const response = await executeSavedRunPdfExport(
      new Request("http://localhost/api/runs/missing/export/pdf"),
      "missing",
      "user-b",
      baseHooks({
        requireRunAccess: async () => ({ ok: false, reason: "not_found" }),
        compileRunPdfFromMarkdown: async () => {
          compileCalled = true;
          return Buffer.from("pdf");
        },
      }),
    );

    assert.equal(response.status, 404);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, "Run not found");
    assert.equal(compileCalled, false);
  });

  it("returns 404 and skips PDF compilation when scoped fetch returns null", async () => {
    let compileCalled = false;

    const response = await executeSavedRunPdfExport(
      new Request("http://localhost/api/runs/run-a/export/pdf"),
      "run-a",
      "user-a",
      baseHooks({
        getRunForWorkspaceIfOwned: async () => null,
        compileRunPdfFromMarkdown: async () => {
          compileCalled = true;
          return Buffer.from("pdf");
        },
      }),
    );

    assert.equal(response.status, 404);
    assert.equal(compileCalled, false);
  });
});
