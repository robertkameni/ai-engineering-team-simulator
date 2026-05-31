import { executeSavedRunPdfExport } from "@/lib/export/saved-run-pdf-export-logic";
import { buildRunStyledMarkdown } from "@/lib/export/build-run-export-document";
import { buildRunPdfFilename } from "@/lib/export/export-filename";
import { compileRunPdfFromMarkdown } from "@/lib/export/run-pdf";
import { getRunForWorkspaceIfOwned } from "@/lib/db/runs";
import { getTeamRoster } from "@/lib/db/team-roster";
import { requireRunAccess } from "@/lib/auth/run-ownership";
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
