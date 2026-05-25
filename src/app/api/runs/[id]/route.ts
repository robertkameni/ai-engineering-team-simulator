import { deleteRun } from "@/lib/db/runs";
import { assertRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { userId } = await getSessionUser();
  const rateLimit = await assertRateLimit(request, "delete", userId);
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit);
  }

  const { id } = await params;
  const deleted = await deleteRun(id);

  if (!deleted) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
