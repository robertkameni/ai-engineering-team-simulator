import type { SimulationAgentRole } from "@/ai/agents/config";
import { incrementRoleCorrectionCount } from "@/ai/orchestration/debate-correction-caps";
import { parseReviewerDecisionWithMangleRecovery } from "@/ai/orchestration/normalize-mangled-decision-tag";
import { getMaxSimulationTurns } from "@/ai/orchestration/reviewer-decision";
import {
  shouldScheduleMissingRoleFirstTurn,
} from "@/ai/orchestration/role-participation";
import { updateReviewerRejectIssues } from "@/ai/orchestration/review-reject-issue-scope";
import {
  getLatestTruncatedCriticalRoles,
  hasCurrentCriticalTruncation,
  syncHasTruncatedCriticalTurn,
} from "@/ai/orchestration/truncation-approval-gate";
import type {
  DebateState,
  TurnContext,
  TurnDirective,
} from "@/ai/orchestration/run-simulation-types";

export function resolveReviewerOutcome(
  role: SimulationAgentRole,
  fullText: string,
  state: DebateState,
  ctx: TurnContext,
): TurnDirective {
  if (role !== "reviewer") {
    return { kind: "progress" };
  }

  const parsed = parseReviewerDecisionWithMangleRecovery(fullText, ctx.roster);

  if (parsed.decision === "approve") {
    return resolveApproveDecision(parsed.displayText, state);
  }

  if (parsed.decision === "reject" && parsed.rejectRole) {
    return resolveRejectDecision(parsed.rejectRole, parsed.displayText, state, ctx);
  }

  return resolveUnknownDecision(parsed.displayText, state);
}

function resolveApproveDecision(
  displayText: string,
  state: DebateState,
): TurnDirective {
  state.lastRejectFeedback = null;
  state.lastRejectTarget = null;
  state.hasHadOpsFollowUpForCurrentReject = false;
  state.focusedOpsFollowUp = null;
  state.reviewerProposal = {
    decision: "approve",
    feedbackText: displayText.trim(),
    source: "reviewer",
    issuedOnTurn: state.turnCount,
  };
  return { kind: "progress" };
}

/**
 * When reviewer approves but a critical turn is still truncated, retry that
 * role once before finalize. Clears postApproveTruncation when recovery
 * succeeds on a later approve; otherwise ships Approved with the warning flag.
 */
export function maybeScheduleTruncationRecovery(
  state: DebateState,
  ctx: TurnContext,
): TurnDirective | null {
  syncHasTruncatedCriticalTurn(state, state.transcript);

  if (!hasCurrentCriticalTruncation(state.transcript)) {
    state.postApproveTruncation = false;
    state.hasTruncatedCriticalTurn = false;
    if (state.truncationRecoveryAttemptedRoles.length > 0) {
      state.postApproveContinuationFailed = false;
    }
    return null;
  }

  const truncatedRoles = getLatestTruncatedCriticalRoles(state.transcript);
  const maxTurns = getMaxSimulationTurns(ctx.templateId);
  const remainingBudget = maxTurns - state.turnCount;
  const recoverableRole = truncatedRoles.find(
    (role) => !state.truncationRecoveryAttemptedRoles.includes(role),
  );

  if (recoverableRole && remainingBudget >= 1) {
    console.info(
      "TRUNCATION RECOVERY: retrying truncated critical turn before finalize approve",
      {
        runId: ctx.runId,
        recoverableRole,
        truncatedRoles,
        turnCount: state.turnCount,
        remainingBudget,
      },
    );
    state.truncationRecoveryAttemptedRoles = [
      ...state.truncationRecoveryAttemptedRoles,
      recoverableRole,
    ];
    state.returnToReviewer = true;
    state.isGateReroute = true;
    return { kind: "reroute", targetRole: recoverableRole };
  }

  console.warn(
    "TRUNCATION APPROVAL GUARD: reviewer approved with truncated critical turns — keeping approved, setting postApproveTruncation",
    { runId: ctx.runId, turnCount: state.turnCount, truncatedRoles },
  );
  state.postApproveTruncation = true;
  state.hasTruncatedCriticalTurn = true;
  if (state.truncationRecoveryAttemptedRoles.length > 0) {
    state.postApproveContinuationFailed = true;
  }
  return null;
}

function resolveRejectDecision(
  rejectRole: SimulationAgentRole,
  displayText: string,
  state: DebateState,
  ctx: TurnContext,
): TurnDirective {
  const shouldRouteMissingRole = shouldScheduleMissingRoleFirstTurn(
    rejectRole,
    state.transcript,
  );
  const scopedRejectRole = shouldRouteMissingRole
    ? rejectRole
    : updateReviewerRejectIssues(state, {
        rejectRole,
        feedbackText: displayText,
        roster: ctx.roster,
      });

  state.reviewerRejectionCount += 1;
  state.roleCorrectionCounts = incrementRoleCorrectionCount(
    state.roleCorrectionCounts,
    scopedRejectRole,
  );
  state.lastRejectFeedback = displayText.trim() || null;
  state.lastRejectTarget = scopedRejectRole;
  state.hasHadOpsFollowUpForCurrentReject = false;
  state.focusedOpsFollowUp = null;
  state.reviewerProposal = {
    decision: "reject",
    feedbackText: displayText.trim(),
    rejectRole,
    scopedRejectRole,
    source: "reviewer",
    issuedOnTurn: state.turnCount,
  };
  return { kind: "progress" };
}

function resolveUnknownDecision(
  displayText: string,
  state: DebateState,
): TurnDirective {
  state.reviewerProposal = {
    decision: "unknown",
    feedbackText: displayText.trim(),
    source: "reviewer",
    issuedOnTurn: state.turnCount,
  };
  return { kind: "progress" };
}
