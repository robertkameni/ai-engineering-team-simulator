import { buildRunMarkdown } from "@/lib/export/build-run-export-document";
import { buildRunMarkdownFilename } from "@/lib/export/export-filename";
import { getRunForWorkspace } from "@/lib/db/runs";
import { getTeamRoster } from "@/lib/db/team-roster";
import {
  requireRunAccess,
  runAccessDeniedResponse,
} from "@/lib/auth/run-ownership";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

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
  const access = await requireRunAccess(id, {
    userId,
    guestSessionId: null,
  });
  if (!access.ok) {
    return runAccessDeniedResponse(access);
  }

  const run = await getRunForWorkspace(id);
  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const roster = await getTeamRoster(id);
  const markdown = buildRunMarkdown({
    run,
    templateId: roster?.templateId,
  });
  const exportId = Date.now();
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
