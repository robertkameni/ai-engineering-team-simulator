import { handleSavedRunPdfExport } from "@/lib/export/handle-saved-run-pdf-export";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 120;

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

  const { id } = await params;
  return handleSavedRunPdfExport(request, id, userId);
}
