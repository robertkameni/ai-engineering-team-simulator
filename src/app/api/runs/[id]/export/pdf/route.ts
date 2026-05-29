import {
  buildRunStyledMarkdown,
  type RunExportContext,
} from "@/lib/export/build-run-export-document";
import { buildRunPdfFilename } from "@/lib/export/export-filename";
import { compileRunPdfFromMarkdown } from "@/lib/export/run-pdf";
import { getRunForWorkspace } from "@/lib/db/runs";
import { getTeamRoster } from "@/lib/db/team-roster";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 120;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { userId } = await getSessionUser();
  if (!userId) {
    return Response.json(
      { error: "Authentication required to export" },
      { status: 401 },
    );
  }

  const { id } = await params;
  const run = await getRunForWorkspace(id);
  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const roster = await getTeamRoster(id);
  const ctx: RunExportContext = {
    run,
    templateId: roster?.templateId,
  };

  const markdown = buildRunStyledMarkdown(ctx);
  const exportId = Date.now();
  const filename = buildRunPdfFilename(run.title, exportId);

  let pdf: Buffer;
  try {
    pdf = await compileRunPdfFromMarkdown(markdown, {
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
