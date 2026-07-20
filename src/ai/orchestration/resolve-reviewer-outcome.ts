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
  shouldScheduleMissingRoleFirstTurn,
} from "@/ai/orchestration/role-participation";
import {
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
      return { kind: "break", outcome: "cap_reached" };
    }

    state.returnToReviewer = true;
    return { kind: "reroute", targetRole: inviteRole };
  }

  // Never downgrade APPROVE to degraded_truncated — warn instead.
  syncHasTruncatedCriticalTurn(state, state.transcript);
  if (hasCurrentCriticalTruncation(state.transcript)) {
    console.warn(
      "TRUNCATION APPROVAL GUARD: reviewer approved with truncated critical turns — keeping approved, setting postApproveTruncation",
      { runId: ctx.runId, turnCount: state.turnCount },
    );
    state.postApproveTruncation = true;
    state.hasTruncatedCriticalTurn = true;
  }

  markIssuesAddressed(state.reviewIssues);
  return { kind: "break", outcome: "approved" };
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

  if (hasExceededReviewerRejectionCap(state.reviewerRejectionCount)) {
    console.warn("Reviewer rejection cap reached, closing debate", {
      runId: ctx.runId,
      reviewerRejectionCount: state.reviewerRejectionCount,
      maxReviewerRejectionCycles: 4,
      perRoleCorrections: { ...state.roleCorrectionCounts },
      openIssues: buildIssueSnapshot(state.reviewIssues).totalOpen,
    });
    return { kind: "break", outcome: "cap_reached" };
  }

  if (!canCorrectRole(state.roleCorrectionCounts, rejectRole)) {
    console.warn("Per-role correction cap reached, closing debate", {
      runId: ctx.runId,
      rejectRole,
      maxPerRole: 2,
      currentCount: state.roleCorrectionCounts[rejectRole] ?? 0,
      openIssues: buildIssueSnapshot(state.reviewIssues).totalOpen,
    });
    return { kind: "break", outcome: "cap_reached" };
  }

  const maxTurns = getMaxSimulationTurns(ctx.templateId);
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
        openIssues: buildIssueSnapshot(state.reviewIssues).totalOpen,
      },
    );
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
