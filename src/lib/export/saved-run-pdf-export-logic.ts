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
import type { MockRun } from "@/features/agents/types";
import type { TeamTemplateId } from "@/ai/agents/team-templates";

export interface SavedRunPdfExportHooks {
  requireRunAccess: (
    runId: string,
    scope: { userId: string; guestSessionId: null },
  ) => Promise<RequireRunAccessResult>;
  assertRateLimit: (
    request: Request,
    action: "export_pdf",
    userId: string,
  ) => Promise<RateLimitResult>;
  getRunForWorkspaceIfOwned: (
    runId: string,
    scope: { userId: string; guestSessionId: null },
  ) => Promise<MockRun | null>;
  getTeamRoster: (
    runId: string,
  ) => Promise<{ templateId?: TeamTemplateId } | null>;
  buildRunStyledMarkdown: typeof buildRunStyledMarkdown;
  compileRunPdfFromMarkdown: (
    markdown: string,
    options: { title: string; author?: string },
  ) => Promise<Buffer>;
  buildRunPdfFilename: typeof buildRunPdfFilename;
  rateLimitResponse: (result: Extract<RateLimitResult, { ok: false }>) => Response;
}

export async function executeSavedRunPdfExport(
  request: Request,
  runId: string,
  userId: string,
  hooks: SavedRunPdfExportHooks,
): Promise<Response> {
  const scope: { userId: string; guestSessionId: null } = {
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

  let pdf: Buffer;
  try {
    pdf = await hooks.compileRunPdfFromMarkdown(markdown, {
      title: run.title,
      author: "AI Engineering Team Simulator",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PDF generation failed";
    console.error("[export/pdf]", message, error);
    return Response.json({ error: "PDF generation failed" }, { status: 500 });
  }

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.byteLength),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}
