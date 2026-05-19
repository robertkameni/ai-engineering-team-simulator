import { mapDbArtifactsToRunArtifacts } from "@/lib/db/artifacts";
import { getRunWithMessages } from "@/lib/db/runs";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const run = await getRunWithMessages(id);

  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const artifacts = mapDbArtifactsToRunArtifacts(run.artifacts);

  return Response.json({
    artifacts,
    status: artifacts ? "ready" : "unavailable",
  });
}
