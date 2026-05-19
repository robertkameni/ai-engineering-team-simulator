import { deleteRun } from "@/lib/db/runs";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const deleted = await deleteRun(id);

  if (!deleted) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
