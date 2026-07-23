import { buildRunMarkdown } from "@/lib/export/build-run-export-document";
import { buildRunMarkdownFilename } from "@/lib/export/export-filename";
import { canExportApprovedRun } from "@/features/artifacts/artifact-panel-phase";
import type { OwnedRunRouteParams } from "@/lib/api/owned-run-route";
import { getRunForWorkspaceIfOwned } from "@/lib/db/runs";
import { getTeamRoster } from "@/lib/db/team-roster";
import {
  resolveAuthenticatedExportRoute,
} from "@/lib/export/require-authenticated-export-session";
import { assertRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: OwnedRunRouteParams) {
  const auth = await resolveAuthenticatedExportRoute(params);
  if (!auth.ok) {
    return auth.response;
  }

  const rateLimit = await assertRateLimit(request, "export_pdf", auth.userId);
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit);
  }

  const access = { userId: auth.userId, guestSessionId: null as string | null };
  const run = await getRunForWorkspaceIfOwned(auth.id, access);

  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const roster = await getTeamRoster(auth.id);
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
