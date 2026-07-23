import { handleSavedRunPdfExport } from "@/lib/export/handle-saved-run-pdf-export";
import {
  resolveAuthenticatedExportRoute,
} from "@/lib/export/require-authenticated-export-session";
import type { OwnedRunRouteParams } from "@/lib/api/owned-run-route";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request, { params }: OwnedRunRouteParams) {
  const auth = await resolveAuthenticatedExportRoute(params);
  if (!auth.ok) {
    return auth.response;
  }

  return handleSavedRunPdfExport(request, auth.id, auth.userId);
}
