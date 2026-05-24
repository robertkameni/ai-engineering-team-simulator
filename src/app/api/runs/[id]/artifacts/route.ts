import { regenerateRunArtifacts } from "@/ai/artifacts/regenerate-run-artifacts";
import { mapDbArtifactsToRunArtifacts } from "@/lib/db/artifacts";
import {
  deriveArtifactsPanelStatus,
  toAppArtifactStatus,
} from "@/lib/db/artifact-status";
import { getRunWithMessages } from "@/lib/db/runs";
import { reconcileStaleRunIfNeeded } from "@/lib/db/run-reconcile";
import { toAppRunStatus } from "@/lib/db/run-status";

export const runtime = "nodejs";
export const maxDuration = 300;

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function getRunForArtifacts(runId: string) {
  let run = await getRunWithMessages(runId);
  if (!run) return null;

  const reconciled = await reconcileStaleRunIfNeeded({
    id: run.id,
    status: run.status,
    artifactStatus: run.artifactStatus,
    updatedAt: run.updatedAt,
    messageCount: run.messages.length,
  });

  if (reconciled) {
    run = await getRunWithMessages(runId);
    if (!run) {
      console.warn("Artifacts lookup: run missing after stale reconcile", {
        runId,
      });
    }
  }

  return run;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const run = await getRunForArtifacts(id);

  if (!run) {
    console.warn("Artifacts GET: run not found", { runId: id });
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
