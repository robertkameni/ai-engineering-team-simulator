import { regenerateRunArtifacts } from "@/ai/artifacts/regenerate-run-artifacts";
import { parseDebateOutcomeFromRunSummary } from "@/ai/orchestration/reviewer-decision";
import {
  getRunOwnershipContext,
  requireRunAccess,
  runAccessDeniedResponse,
} from "@/lib/auth/run-ownership";
import { mapDbArtifactsToRunArtifacts } from "@/lib/db/artifacts";
import {
  deriveArtifactsPanelStatus,
  toAppArtifactStatus,
} from "@/lib/db/artifact-status";
import { getRunForArtifactsIfOwned } from "@/lib/db/runs";
import { toAppRunStatus } from "@/lib/db/run-status";

export const runtime = "nodejs";
export const maxDuration = 300;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const scope = await getRunOwnershipContext();
  const run = await getRunForArtifactsIfOwned(id, scope);

  if (!run) {
    console.warn("Artifacts GET: run not found or forbidden", { runId: id });
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
    debateOutcome: parseDebateOutcomeFromRunSummary(run.summary),
  });
}

export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const scope = await getRunOwnershipContext();
  const access = await requireRunAccess(id, scope);
  if (!access.ok) {
    return runAccessDeniedResponse(access);
  }

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
    if (result.error === "generation_active") {
      return Response.json(
        {
          error:
            result.message ??
            "A generation process is already active for this workspace.",
        },
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
