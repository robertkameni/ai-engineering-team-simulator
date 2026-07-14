import { deleteRunIfOwned, getRunForWorkspaceIfOwned } from "@/lib/db/runs";
import { getTeamRoster } from "@/lib/db/team-roster";
import { getRunOwnershipContext } from "@/lib/auth/run-ownership";
import { assertRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { rosterToPreview } from "@/features/simulation/team-roster-preview";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string; }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const scope = await getRunOwnershipContext();
  const run = await getRunForWorkspaceIfOwned(id, scope);

  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const teamRosterRecord = await getTeamRoster(id);

  return Response.json({
    id: run.id,
    status: run.status,
    messages: run.messages,
    artifacts: run.artifacts,
    artifactsStatus: run.artifactsStatus,
    debateOutcome: run.debateOutcome,
    teamRoster:
      teamRosterRecord != null ? rosterToPreview(teamRosterRecord) : null,
    stackValidationFailed: run.stackValidationFailed === true,
    crossValidationFailed: run.crossValidationFailed === true,
    opsFollowUpEvaluated: run.opsFollowUpEvaluated === true,
    opsFollowUpTriggered: run.opsFollowUpTriggered === true,
    opsFollowUpSkipReason: run.opsFollowUpSkipReason ?? null,
    opsFollowUpEligible: run.opsFollowUpEligible === true,
    opsFollowUpUnresolvedDevopsIssueCount:
      run.opsFollowUpUnresolvedDevopsIssueCount ?? 0,
    opsFollowUpLastCorrectionRole: run.opsFollowUpLastCorrectionRole ?? null,
    opsFollowUpEvaluationTurn: run.opsFollowUpEvaluationTurn ?? null,
  });
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
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
