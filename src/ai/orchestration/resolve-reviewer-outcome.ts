import type { SimulationAgentRole } from "@/ai/agents/config";
import { incrementRoleCorrectionCount } from "@/ai/orchestration/debate-correction-caps";
import { parseReviewerDecisionWithMangleRecovery } from "@/ai/orchestration/normalize-mangled-decision-tag";
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

/**
 * Prefer approve when a correction loop is detected or near turn-cap with
 * minor open issues. Returns null when neither path applies.
 */
function preferLoopOrNearCapApprove(
  state: DebateState,
  ctx: TurnContext,
  maxTurns: number,
  openIssueCount: number,
): TurnDirective | null {
  const unresolvedOpsIssueCount = unresolvedOpsCount(state);

  if (
    shouldPreferCorrectionLoopApprove({
      transcript: state.transcript,
      correctionLoopDetected: state.correctionLoopDetected,
      unresolvedOpsIssueCount,
    })
  ) {
    console.info(
      "CORRECTION LOOP APPROVE: unproductive reject cycles — preferring approve",
      {
        runId: ctx.runId,
        turnCount: state.turnCount,
        consecutiveUnproductiveCycles: state.consecutiveUnproductiveCycles,
        openIssueCount,
      },
    );
    markIssuesAddressed(state.reviewIssues);
    return { kind: "break", outcome: "approved" };
  }

  if (
    shouldPreferNearCapApprove({
      transcript: state.transcript,
      turnCount: state.turnCount,
      maxTurns,
      openIssueCount,
      unresolvedOpsIssueCount,
    })
  ) {
    console.info("NEAR-CAP APPROVE: preferring approve over further reject cycles", {
      runId: ctx.runId,
      turnCount: state.turnCount,
      maxTurns,
      openIssueCount,
    });
    markIssuesAddressed(state.reviewIssues);
    return { kind: "break", outcome: "approved" };
  }

  return null;
}

function preferNearCapApproveOrCap(
  state: DebateState,
  ctx: TurnContext,
  maxTurns: number,
): TurnDirective {
  const openIssueCount = buildIssueSnapshot(state.reviewIssues).totalOpen;
  const approve = preferLoopOrNearCapApprove(state, ctx, maxTurns, openIssueCount);
  if (approve) {
    return approve;
  }

  return { kind: "break", outcome: "cap_reached" };
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
