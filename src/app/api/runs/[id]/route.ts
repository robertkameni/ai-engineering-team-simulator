import { deleteRunIfOwned } from "@/lib/db/runs";
import { getRunOwnershipContext } from "@/lib/auth/run-ownership";
import { assertRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const ownership = await getRunOwnershipContext();
  const rateLimit = await assertRateLimit(request, "delete", ownership.userId);
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit);
  }

  const { id } = await params;
  const result = await deleteRunIfOwned(id, ownership);

  if (result === "not_found") {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  if (result === "forbidden") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return new Response(null, { status: 204 });
}
