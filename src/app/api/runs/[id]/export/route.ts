import { buildRunMarkdown } from "@/lib/export/build-run-export-document";
import { buildRunMarkdownFilename } from "@/lib/export/export-filename";
import { canExportApprovedRun } from "@/features/artifacts/artifact-panel-phase";
import { getRunForWorkspaceIfOwned } from "@/lib/db/runs";
import { getTeamRoster } from "@/lib/db/team-roster";
import { getSessionUser } from "@/lib/auth/session";
import { assertRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { userId } = await getSessionUser();
  if (!userId) {
    return Response.json(
      { error: "Authentication required to export" },
      { status: 401 },
    );
  }

  const rateLimit = await assertRateLimit(request, "export_pdf", userId);
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit);
  }

  const { id } = await params;
  const access = { userId, guestSessionId: null as string | null };
  const run = await getRunForWorkspaceIfOwned(id, access);

  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const roster = await getTeamRoster(id);
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

  const markdown = buildRunMarkdown({
    run,
    templateId: roster?.templateId,
  });
  const exportId = crypto.randomUUID();
  const filename = buildRunMarkdownFilename(run.title, exportId);

  return new Response(`${markdown}<!-- export-id: ${exportId} -->\n`, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}
