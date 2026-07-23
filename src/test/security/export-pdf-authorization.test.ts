import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  executeSavedRunPdfExport,
  type SavedRunPdfExportHooks,
} from "../../lib/export/saved-run-pdf-export-logic.js";
import { buildRunStyledMarkdown } from "../../lib/export/build-run-export-document.js";
import { buildRunPdfFilename } from "../../lib/export/export-filename.js";
import { rateLimitResponse } from "@/lib/rate-limit-response";

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

async function exportPdf(
  runId: string,
  userId: string,
  hooks: Partial<SavedRunPdfExportHooks>,
) {
  return executeSavedRunPdfExport(
    new Request(`http://localhost/api/runs/${runId}/export/pdf`),
    runId,
    userId,
    baseHooks(hooks),
  );
}

describe("executeSavedRunPdfExport — access check", () => {
  it("returns 404 and skips PDF compilation when access is forbidden", async () => {
    let compileCalled = false;

    const response = await exportPdf("run-a", "user-b", {
      requireRunAccess: async () => ({ ok: false, reason: "forbidden" }),
      compileRunPdfFromMarkdown: async () => {
        compileCalled = true;
        return Buffer.from("pdf");
      },
    });

    assert.equal(response.status, 404);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, "Run not found");
    assert.equal(compileCalled, false);
  });

  it("returns 404 and skips PDF compilation when run is not found in access check", async () => {
    let compileCalled = false;

    const response = await exportPdf("missing", "user-b", {
      requireRunAccess: async () => ({ ok: false, reason: "not_found" }),
      compileRunPdfFromMarkdown: async () => {
        compileCalled = true;
        return Buffer.from("pdf");
      },
    });

    assert.equal(response.status, 404);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, "Run not found");
    assert.equal(compileCalled, false);
  });
});

describe("executeSavedRunPdfExport — owned fetch", () => {
  it("returns 404 and skips PDF compilation when scoped fetch returns null", async () => {
    let compileCalled = false;

    const response = await exportPdf("run-a", "user-a", {
      getRunForWorkspaceIfOwned: async () => null,
      compileRunPdfFromMarkdown: async () => {
        compileCalled = true;
        return Buffer.from("pdf");
      },
    });

    assert.equal(response.status, 404);
    assert.equal(compileCalled, false);
  });
});
