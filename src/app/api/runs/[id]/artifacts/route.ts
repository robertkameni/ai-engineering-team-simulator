import { regenerateRunArtifacts } from "@/ai/artifacts/regenerate-run-artifacts";
import { mapDbArtifactsToRunArtifacts } from "@/lib/db/artifacts";
import {
  deriveArtifactsPanelStatus,
  toAppArtifactStatus,
} from "@/lib/db/artifact-status";
import { getRunWithMessages } from "@/lib/db/runs";
import { toAppRunStatus } from "@/lib/db/run-status";

export const runtime = "nodejs";
export const maxDuration = 300;

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
  const panelStatus = deriveArtifactsPanelStatus(
    toAppRunStatus(run.status),
    toAppArtifactStatus(run.artifactStatus),
  );

  return Response.json({
    artifacts,
    status: panelStatus,
  });
}

export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const result = await regenerateRunArtifacts(id);

  if (!result.ok) {
    if (result.error === "not_found") {
      return Response.json({ error: "Run not found" }, { status: 404 });
    }
    if (result.error === "no_messages") {
      return Response.json(
        { error: "Run has no debate messages to synthesize from" },
        { status: 400 },
      );
    }
    if (result.error === "run_in_progress") {
      return Response.json(
        { error: "Artifacts can only be regenerated after the run finishes" },
        { status: 409 },
      );
    }
    return Response.json(
      { error: result.message ?? "Artifact generation failed" },
      { status: 500 },
    );
  }

  return Response.json({
    artifacts: result.artifacts,
    status: "ready" as const,
  });
}
