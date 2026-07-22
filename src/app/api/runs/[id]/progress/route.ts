import { getRunOwnershipContext } from "@/lib/auth/run-ownership";
import { getRunProgressIfOwned } from "@/lib/db/run-progress";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Lightweight run progress for stream-drop recovery (arch-review F2).
 * Full messages/artifacts stay on GET /api/runs/[id].
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const scope = await getRunOwnershipContext();
  const progress = await getRunProgressIfOwned(id, scope);

  if (!progress) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  return Response.json(progress);
}
