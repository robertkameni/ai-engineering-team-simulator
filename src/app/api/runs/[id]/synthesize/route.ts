import { scheduleCoreArtifactSynthesis } from "@/lib/ai/schedule-artifact-synthesis";
import { getRunOwnershipContext } from "@/lib/auth/run-ownership";
import { requireRunAccess } from "@/lib/auth/run-ownership";

export const runtime = "nodejs";
export const maxDuration = 600;

interface RouteParams {
  params: Promise<{ id: string; }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const scope = await getRunOwnershipContext();
  const access = await requireRunAccess(id, scope);

  if (!access.ok) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  await scheduleCoreArtifactSynthesis({ runId: id, scope });

  return Response.json({ ok: true });
}
