import { deleteRunIfOwned, getRunForWorkspaceIfOwned } from "@/lib/db/runs";
import {
  resolveOwnedRunRoute,
  runNotFoundResponse,
  type OwnedRunRouteParams,
} from "@/lib/api/owned-run-route";
import { assertRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { rosterToPreview } from "@/features/simulation/team-roster-preview";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: OwnedRunRouteParams) {
  const { id, scope } = await resolveOwnedRunRoute(params);
  const run = await getRunForWorkspaceIfOwned(id, scope);

  if (!run) {
    return runNotFoundResponse();
  }

  return Response.json({
    id: run.id,
    status: run.status,
    messages: run.messages,
    artifacts: run.artifacts,
    artifactsStatus: run.artifactsStatus,
    debateOutcome: run.debateOutcome,
    teamRoster:
      run.teamRoster != null ? rosterToPreview(run.teamRoster) : null,
    stackValidationFailed: run.stackValidationFailed === true,
    crossValidationFailed: run.crossValidationFailed === true,
    opsFollowUpEvaluated: run.opsFollowUpEvaluated === true,
    opsFollowUpTriggered: run.opsFollowUpTriggered === true,
    opsFollowUpSkipReason: run.opsFollowUpSkipReason ?? null,
    opsFollowUpEligible: run.opsFollowUpEligible === true,
    opsFollowUpUnresolvedDevopsIssueCount:
      run.opsFollowUpUnresolvedDevopsIssueCount ?? 0,
    opsFollowUpOpenIssueCount:
      run.opsFollowUpOpenIssueCount ?? run.opsFollowUpUnresolvedDevopsIssueCount ?? 0,
    opsFollowUpAddressedIssueCount: run.opsFollowUpAddressedIssueCount ?? 0,
    opsFollowUpAcceptedRiskIssueCount: run.opsFollowUpAcceptedRiskIssueCount ?? 0,
    opsFollowUpAcceptedRiskReasons: run.opsFollowUpAcceptedRiskReasons ?? [],
    opsFollowUpLastCorrectionRole: run.opsFollowUpLastCorrectionRole ?? null,
    opsFollowUpEvaluationTurn: run.opsFollowUpEvaluationTurn ?? null,
    opsFollowUpArchitectCheckpoint: run.opsFollowUpArchitectCheckpoint ?? null,
    finalization: run.finalization ?? null,
  });
}

export async function DELETE(request: Request, { params }: OwnedRunRouteParams) {
  const { id, scope: ownership } = await resolveOwnedRunRoute(params);
  const rateLimit = await assertRateLimit(request, "delete", ownership.userId);
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit);
  }

  const result = await deleteRunIfOwned(id, ownership);

  if (result === "not_found" || result === "forbidden") {
    return runNotFoundResponse();
  }

  return new Response(null, { status: 204 });
}
