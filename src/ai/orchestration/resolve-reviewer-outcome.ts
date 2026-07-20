import type { SimulationAgentRole } from "@/ai/agents/config";
import {
  canCorrectRole,
  incrementRoleCorrectionCount,
} from "@/ai/orchestration/debate-correction-caps";
import {
  createReviewIssues,
  markIssuesAddressed,
  buildIssueSnapshot,
} from "@/ai/orchestration/review-issue-tracker";
import {
  hasExceededReviewerRejectionCap,
  getMaxSimulationTurns,
  resolveUnknownReviewerDecision,
} from "@/ai/orchestration/reviewer-decision";
import { parseReviewerDecisionWithMangleRecovery } from "@/ai/orchestration/normalize-mangled-decision-tag";
import {
  canApproveWithFullParticipation,
  listMissingPipelineRoles,
  shouldPreferNearCapApprove,
  shouldScheduleMissingRoleFirstTurn,
} from "@/ai/orchestration/role-participation";
import { getUnresolvedDevOpsIssues } from "@/ai/orchestration/ops-follow-up";
import {
  hasReachedHardCorrectionLimit,
  recordRejectCycle,
  shouldPreferCorrectionLoopApprove,
} from "@/ai/orchestration/correction-loop";
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

function unresolvedOpsCount(state: DebateState): number {
  return getUnresolvedDevOpsIssues(state.reviewIssues).length;
}

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
    return resolveApproveDecision(state, ctx);
  }

  if (parsed.decision === "reject" && parsed.rejectRole) {
    return resolveRejectDecision(parsed.rejectRole, parsed.displayText, state, ctx);
  }

  return resolveUnknownDecision(parsed.displayText, state, ctx);
}

function resolveApproveDecision(
  state: DebateState,
  ctx: TurnContext,
): TurnDirective {
  state.lastRejectFeedback = null;
  state.lastRejectTarget = null;
  state.hasHadOpsFollowUpForCurrentReject = false;
  state.focusedOpsFollowUp = null;

  if (!canApproveWithFullParticipation(state.transcript)) {
    const missing = listMissingPipelineRoles(state.transcript);
    const inviteRole =
      (missing.includes("devops") ? "devops" : missing[0]) ?? null;

    if (!inviteRole) {
      markIssuesAddressed(state.reviewIssues);
      return { kind: "break", outcome: "approved" };
    }

    console.info(
      "ROLE PARTICIPATION: blocking APPROVE until silent roles speak",
      {
        runId: ctx.runId,
        inviteRole,
        missing,
        turnCount: state.turnCount,
      },
    );

    const maxTurns = getMaxSimulationTurns(ctx.templateId);
    if (state.turnCount >= maxTurns - 1) {
      return preferNearCapApproveOrCap(state, ctx, maxTurns);
    }

    state.returnToReviewer = true;
    return { kind: "reroute", targetRole: inviteRole };
  }

  const truncationRecovery = maybeScheduleTruncationRecovery(state, ctx);
  if (truncationRecovery) {
    return truncationRecovery;
  }

  markIssuesAddressed(state.reviewIssues);
  return { kind: "break", outcome: "approved" };
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

function syncCorrectionLoopFromReject(
  state: DebateState,
  rejectRole: SimulationAgentRole,
  displayText: string,
  newIssueCount: number,
): void {
  const updated = recordRejectCycle(
    {
      consecutiveUnproductiveCycles: state.consecutiveUnproductiveCycles,
      correctionLoopDetected: state.correctionLoopDetected,
      lastRejectRole: state.lastRejectTarget,
      lastRejectKeywordKey: null,
    },
    {
      rejectRole,
      feedbackText: displayText,
      reviewIssues: state.reviewIssues,
      newIssueCount,
    },
  );
  state.consecutiveUnproductiveCycles = updated.consecutiveUnproductiveCycles;
  state.correctionLoopDetected = updated.correctionLoopDetected;
}

function resolveRejectDecision(
  rejectRole: SimulationAgentRole,
  displayText: string,
  state: DebateState,
  ctx: TurnContext,
): TurnDirective {
  if (shouldScheduleMissingRoleFirstTurn(rejectRole, state.transcript)) {
    console.info(
      "ROLE PARTICIPATION: routing missing-role reject to first turn (not correction)",
      {
        runId: ctx.runId,
        rejectRole,
        turnCount: state.turnCount,
      },
    );
    state.lastRejectFeedback = null;
    state.lastRejectTarget = null;
    state.returnToReviewer = true;
    return { kind: "reroute", targetRole: rejectRole };
  }

  const newIssues = createReviewIssues(
    state.reviewIssues,
    rejectRole,
    displayText,
    state.reviewerRejectionCount,
    state.turnCount,
    ctx.roster,
  );
  state.reviewIssues.push(...newIssues);
  syncCorrectionLoopFromReject(state, rejectRole, displayText, newIssues.length);

  const maxTurns = getMaxSimulationTurns(ctx.templateId);
  const openIssueCount = buildIssueSnapshot(state.reviewIssues).totalOpen;

  const nearCapOrLoopApprove = preferLoopOrNearCapApprove(
    state,
    ctx,
    maxTurns,
    openIssueCount,
  );
  if (nearCapOrLoopApprove) {
    return nearCapOrLoopApprove;
  }

  if (hasExceededReviewerRejectionCap(state.reviewerRejectionCount)) {
    console.warn("Reviewer rejection cap reached, closing debate", {
      runId: ctx.runId,
      reviewerRejectionCount: state.reviewerRejectionCount,
      maxReviewerRejectionCycles: 4,
      perRoleCorrections: { ...state.roleCorrectionCounts },
      openIssues: openIssueCount,
    });
    return preferNearCapApproveOrCap(state, ctx, maxTurns);
  }

  if (
    !canCorrectRole(state.roleCorrectionCounts, rejectRole) ||
    hasReachedHardCorrectionLimit(state.roleCorrectionCounts, rejectRole)
  ) {
    console.warn("Per-role correction cap reached, closing debate", {
      runId: ctx.runId,
      rejectRole,
      maxPerRole: 2,
      currentCount: state.roleCorrectionCounts[rejectRole] ?? 0,
      openIssues: openIssueCount,
    });
    return preferNearCapApproveOrCap(state, ctx, maxTurns);
  }

  const remainingBudget = maxTurns - state.turnCount;

  if (remainingBudget < 2) {
    console.warn(
      "BUDGET-AWARE REVIEWER GUARD: insufficient remaining budget for reject cycle — exiting with open gaps",
      {
        runId: ctx.runId,
        turnCount: state.turnCount,
        maxTurns,
        remainingBudget,
        rejectRole,
        templateId: ctx.templateId,
        openIssues: openIssueCount,
      },
    );
    const budgetApprove = preferLoopOrNearCapApprove(
      state,
      ctx,
      maxTurns,
      openIssueCount,
    );
    if (budgetApprove) {
      return budgetApprove;
    }
    return { kind: "break", outcome: "insufficient_budget" };
  }

  state.reviewerRejectionCount += 1;
  state.roleCorrectionCounts = incrementRoleCorrectionCount(
    state.roleCorrectionCounts,
    rejectRole,
  );
  state.lastRejectFeedback = displayText.trim() || null;
  state.lastRejectTarget = rejectRole;
  state.hasHadOpsFollowUpForCurrentReject = false;
  state.focusedOpsFollowUp = null;
  return { kind: "reroute", targetRole: rejectRole };
}

function resolveUnknownDecision(
  displayText: string,
  state: DebateState,
  ctx: TurnContext,
): TurnDirective {
  console.warn("Invalid reviewer decision, routing correction");

  const fallback = resolveUnknownReviewerDecision();
  const fallbackRole = fallback.rejectRole ?? "pm";

  const maxTurns = getMaxSimulationTurns(ctx.templateId);
  const remainingBudget = maxTurns - state.turnCount;
  const openIssueCount = buildIssueSnapshot(state.reviewIssues).totalOpen;

  const loopOrNearCap = preferLoopOrNearCapApprove(
    state,
    ctx,
    maxTurns,
    openIssueCount,
  );
  if (loopOrNearCap) {
    return loopOrNearCap;
  }

  if (remainingBudget >= 2 && state.turnCount < maxTurns) {
    if (!canCorrectRole(state.roleCorrectionCounts, fallbackRole)) {
      return { kind: "break", outcome: "unknown_reject_fallback" };
    }

    state.roleCorrectionCounts = incrementRoleCorrectionCount(
      state.roleCorrectionCounts,
      fallbackRole,
    );
    state.lastRejectFeedback = displayText.trim() || null;
    state.lastRejectTarget = fallbackRole;
    return { kind: "reroute", targetRole: fallbackRole };
  }

  return { kind: "break", outcome: "unknown_reject_fallback" };
}
