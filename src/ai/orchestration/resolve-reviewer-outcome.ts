import type { SimulationAgentRole } from "@/ai/agents/config";
import { incrementRoleCorrectionCount } from "@/ai/orchestration/debate-correction-caps";
import { parseReviewerDecisionWithMangleRecovery } from "@/ai/orchestration/normalize-mangled-decision-tag";
import { getMaxSimulationTurns } from "@/ai/orchestration/reviewer-decision";
import {
  markIssuesAddressed,
} from "@/ai/orchestration/review-issue-tracker";
import {
  shouldScheduleMissingRoleFirstTurn,
} from "@/ai/orchestration/role-participation";
import { updateReviewerRejectIssues } from "@/ai/orchestration/review-reject-issue-scope";
import { planPostApproveTruncationRecovery } from "@/ai/orchestration/truncation-approval-gate";
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
  closeScopedReReviewIssues(state);
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
 * A scoped re-review approval is the reviewer's verdict that every assigned
 * issue for the corrected role is resolved. Close those issues so deterministic
 * finalization does not auto-accept resolved work as "accepted critical risks"
 * (which makes artifacts describe implemented fixes as unresolved).
 */
function lastNonReviewerEntry(
  transcript: DebateState["transcript"],
): DebateState["transcript"][number] | undefined {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const entry = transcript[index];
    if (entry && entry.role !== "reviewer") {
      return entry;
    }
  }
  return undefined;
}

function closeScopedReReviewIssues(state: DebateState): void {
  const targetRole = state.lastRejectTarget;
  if (!targetRole) {
    return;
  }

  const lastEntry = lastNonReviewerEntry(state.transcript);
  if (!lastEntry || lastEntry.role !== targetRole) {
    return;
  }

  const assignedIssues = state.reviewIssues.filter(
    (issue) => issue.targetRole === targetRole && issue.status === "open",
  );
  if (assignedIssues.length === 0) {
    return;
  }

  console.info("RE-REVIEW APPROVE: closing assigned issues as addressed", {
    targetRole,
    closedIssueCount: assignedIssues.length,
    issueIds: assignedIssues.map((issue) => issue.id),
  });
  markIssuesAddressed(assignedIssues);
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
  const remainingBudget =
    getMaxSimulationTurns(ctx.templateId) - state.turnCount;
  const plan = planPostApproveTruncationRecovery(
    state,
    state.transcript,
    remainingBudget,
  );

  if (plan.kind === "schedule") {
    console.info(
      "TRUNCATION RECOVERY: retrying truncated critical turn before finalize approve",
      {
        runId: ctx.runId,
        recoverableRole: plan.role,
        turnCount: state.turnCount,
        remainingBudget,
      },
    );
    state.returnToReviewer = true;
    state.isGateReroute = true;
    return { kind: "reroute", targetRole: plan.role };
  }

  if (plan.kind === "ship_with_warning") {
    console.warn(
      "TRUNCATION APPROVAL GUARD: reviewer approved with truncated critical turns — keeping approved, setting postApproveTruncation",
      { runId: ctx.runId, turnCount: state.turnCount },
    );
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
