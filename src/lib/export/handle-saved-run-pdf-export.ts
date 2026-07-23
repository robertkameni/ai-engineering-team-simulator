import { executeSavedRunPdfExport } from "@/lib/export/saved-run-pdf-export-logic";
import { buildRunStyledMarkdown } from "@/lib/export/build-run-export-document";
import { buildRunPdfFilename } from "@/lib/export/export-filename";
import { compileRunPdfFromMarkdown } from "@/lib/export/run-pdf";
import { getRunForWorkspaceIfOwned } from "@/lib/db/runs";
import { getTeamRoster } from "@/lib/db/team-roster";
import { requireRunAccess } from "@/lib/auth/run-ownership";
import type { OwnedRunRouteParams } from "@/lib/api/owned-run-route";
import { requireAuthenticatedExportSession } from "@/lib/export/require-authenticated-export-session";
import { assertRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function handleSavedRunPdfExport(
  request: Request,
  runId: string,
  userId: string,
): Promise<Response> {
  return executeSavedRunPdfExport(request, runId, userId, {
    requireRunAccess,
    assertRateLimit,
    getRunForWorkspaceIfOwned,
    getTeamRoster,
    buildRunStyledMarkdown,
    compileRunPdfFromMarkdown,
    buildRunPdfFilename,
    rateLimitResponse,
  });
}

/** App Router GET for `/api/runs/[id]/export/pdf`. */
export async function GET(
  request: Request,
  { params }: OwnedRunRouteParams,
): Promise<Response> {
  const session = await requireAuthenticatedExportSession();
  if (!session.ok) {
    return session.response;
  }

  const { id } = await params;
  return handleSavedRunPdfExport(request, id, session.userId);
}
