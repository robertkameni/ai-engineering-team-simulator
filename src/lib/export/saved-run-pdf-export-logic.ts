import {
  buildRunStyledMarkdown,
  type RunExportContext,
} from "@/lib/export/build-run-export-document";
import { buildRunPdfFilename } from "@/lib/export/export-filename";
import {
  runAccessDeniedResponse,
} from "@/lib/auth/run-access-denied-response";
import type { RequireRunAccessResult } from "@/lib/auth/run-ownership";
import type { RateLimitResult } from "@/lib/rate-limit-config";
import { canExportApprovedRun } from "@/features/artifacts/artifact-panel-phase";
import type { MockRun } from "@/lib/types";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import { buildCompiledPdfAttachmentResponse } from "@/lib/export/pdf-attachment-response";

export interface SavedRunPdfExportHooks {
  requireRunAccess: (
    runId: string,
    scope: { userId: string; guestSessionId: null; },
  ) => Promise<RequireRunAccessResult>;
  assertRateLimit: (
    request: Request,
    action: "export_pdf",
    userId: string,
  ) => Promise<RateLimitResult>;
  getRunForWorkspaceIfOwned: (
    runId: string,
    scope: { userId: string; guestSessionId: null; },
  ) => Promise<(MockRun & { teamRoster?: unknown; }) | null>;
  getTeamRoster: (
    runId: string,
  ) => Promise<{ templateId?: TeamTemplateId; } | null>;
  buildRunStyledMarkdown: typeof buildRunStyledMarkdown;
  compileRunPdfFromMarkdown: (
    markdown: string,
    options: { title: string; author?: string; },
  ) => Promise<Buffer>;
  buildRunPdfFilename: typeof buildRunPdfFilename;
  rateLimitResponse: (result: Extract<RateLimitResult, { ok: false; }>) => Response;
}

export async function executeSavedRunPdfExport(
  request: Request,
  runId: string,
  userId: string,
  hooks: SavedRunPdfExportHooks,
): Promise<Response> {
  const scope: { userId: string; guestSessionId: null; } = {
    userId,
    guestSessionId: null,
  };

  const access = await hooks.requireRunAccess(runId, scope);
  if (!access.ok) {
    return runAccessDeniedResponse(access);
  }

  const rateLimit = await hooks.assertRateLimit(request, "export_pdf", userId);
  if (!rateLimit.ok) {
    return hooks.rateLimitResponse(rateLimit);
  }

  const run = await hooks.getRunForWorkspaceIfOwned(runId, scope);
  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  if (
    !canExportApprovedRun({
      debateOutcome: run.debateOutcome,
      artifacts: run.artifacts,
    })
  ) {
    return Response.json(
      {
        error:
          "Artifacts are not ready for this approved run. Wait for synthesis to finish, then retry export.",
      },
      { status: 409 },
    );
  }

  const roster = await hooks.getTeamRoster(runId);
  const ctx: RunExportContext = {
    run,
    templateId: roster?.templateId,
  };

  const markdown = hooks.buildRunStyledMarkdown(ctx);
  const exportId = Date.now();
  const filename = hooks.buildRunPdfFilename(run.title, exportId);

  return buildCompiledPdfAttachmentResponse({
    markdown,
    title: run.title,
    filename,
    compileRunPdfFromMarkdown: hooks.compileRunPdfFromMarkdown,
  });
}