import { parseDebateOutcomeFromRunSummary } from "@/ai/orchestration/reviewer-decision";
import { parseRunSummary } from "@/lib/db/run-summary";
import { handleRegenerateArtifactsPost } from "@/lib/api/handle-regenerate-artifacts-post";
import { getRunOwnershipContext } from "@/lib/auth/run-ownership";
import { mapDbArtifactsToRunArtifacts } from "@/lib/db/artifacts";
import {
  deriveArtifactsPanelStatus,
  toAppArtifactStatus,
} from "@/lib/db/artifact-status";
import { opsFollowUpApiFieldsFromSummaryPayload } from "@/lib/db/ops-follow-up-summary";
import { getRunForArtifactsIfOwned } from "@/lib/db/runs";
import { toAppRunStatus } from "@/lib/db/run-status";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 600;

interface RouteParams {
  params: Promise<{ id: string; }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const scope = await getRunOwnershipContext();
  const run = await getRunForArtifactsIfOwned(id, scope);

  if (!run) {
    const unscoped = await prisma.run.findUnique({
      where: { id },
      select: { id: true, userId: true, guestSessionId: true },
    });
    console.warn("Artifacts GET: run not found or forbidden", {
      runId: id,
      scope: { userId: scope.userId, guestSessionId: scope.guestSessionId },
      runExists: unscoped !== null,
      runOwner: unscoped
        ? { userId: unscoped.userId, guestSessionId: unscoped.guestSessionId }
        : null,
    });
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const artifacts = mapDbArtifactsToRunArtifacts(run.artifacts);
  const panelStatus = deriveArtifactsPanelStatus(
    toAppRunStatus(run.status),
    toAppArtifactStatus(run.artifactStatus),
  );

  const summaryPayload = parseRunSummary(run.summary);

  return Response.json({
    artifacts,
    status: panelStatus,
    debateOutcome: parseDebateOutcomeFromRunSummary(run.summary),
    stackValidationFailed: summaryPayload?.stackValidationFailed === true,
    crossValidationFailed: summaryPayload?.crossValidationFailed === true,
    ...opsFollowUpApiFieldsFromSummaryPayload(summaryPayload),
    finalization: summaryPayload?.finalization ?? null,
  });
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const scope = await getRunOwnershipContext();
  return handleRegenerateArtifactsPost(request, id, scope);
}
