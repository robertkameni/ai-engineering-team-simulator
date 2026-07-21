import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";
import { recordRejectCycle } from "@/ai/orchestration/correction-loop";
import {
  createReviewIssueBaseline,
  createReviewIssues,
  createReviewIssuesWithinBaseline,
} from "@/ai/orchestration/review-issue-tracker";
import type { DebateState } from "@/ai/orchestration/run-simulation-types";

interface UpdateReviewerRejectIssuesParams {
  readonly rejectRole: SimulationAgentRole;
  readonly feedbackText: string;
  readonly roster: TeamRoster;
}

function resolveScopedRejectRole(
  state: DebateState,
  rejectRole: SimulationAgentRole,
  updatedIssueIds: readonly string[],
  blockedNewIssuesCount: number,
): SimulationAgentRole {
  if (updatedIssueIds.length > 0 || blockedNewIssuesCount === 0) {
    return rejectRole;
  }

  const baselineOpenIssue = state.reviewIssues.find(
    (issue) =>
      issue.status === "open" &&
      state.reviewIssueBaseline?.issueIds.has(issue.id),
  );
  return baselineOpenIssue?.targetRole ?? state.lastRejectTarget ?? rejectRole;
}

function updateCorrectionLoop(
  state: DebateState,
  rejectRole: SimulationAgentRole,
  feedbackText: string,
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
      feedbackText,
      reviewIssues: state.reviewIssues,
      newIssueCount,
    },
  );
  state.consecutiveUnproductiveCycles = updated.consecutiveUnproductiveCycles;
  state.correctionLoopDetected = updated.correctionLoopDetected;
}

export function updateReviewerRejectIssues(
  state: DebateState,
  params: UpdateReviewerRejectIssuesParams,
): SimulationAgentRole {
  if (state.reviewIssueBaseline === null) {
    const newIssues = createReviewIssues(
      state.reviewIssues,
      params.rejectRole,
      params.feedbackText,
      state.reviewerRejectionCount,
      state.turnCount,
      params.roster,
    );
    state.reviewIssues.push(...newIssues);
    state.reviewIssueBaseline = createReviewIssueBaseline(state.reviewIssues);
    updateCorrectionLoop(
      state,
      params.rejectRole,
      params.feedbackText,
      newIssues.length,
    );
    return params.rejectRole;
  }

  const scopedResult = createReviewIssuesWithinBaseline({
    existingIssues: state.reviewIssues,
    rejectRole: params.rejectRole,
    feedbackText: params.feedbackText,
    cycleIndex: state.reviewerRejectionCount,
    turnCount: state.turnCount,
    roster: params.roster,
    baseline: state.reviewIssueBaseline,
  });
  const scopedRejectRole = resolveScopedRejectRole(
    state,
    params.rejectRole,
    scopedResult.updatedIssueIds,
    scopedResult.blockedNewIssuesCount,
  );
  updateCorrectionLoop(state, scopedRejectRole, params.feedbackText, 0);
  return scopedRejectRole;
}
