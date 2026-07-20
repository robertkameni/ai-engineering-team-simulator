import type { SimulationAgentRole } from "@/ai/agents/config";
import { getTeamMember, type TeamRoster } from "@/ai/agents/roster";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { TranscriptEntry } from "@/ai/context/transcript";
import { canCorrectRole } from "@/ai/orchestration/debate-correction-caps";
import {
  inferIssueOwnerFromConcern,
  isDevOpsOwnedConcern,
  matchesOperationalCategory,
} from "@/ai/orchestration/issue-ownership";
import {
  canScheduleArchitectRevision,
  getMaxSimulationTurns,
} from "@/ai/orchestration/reviewer-decision";
import type { ReviewIssue } from "@/ai/orchestration/review-issue-tracker";
import type {
  OpsFollowUpCheckpoint,
  OpsFollowUpLastCorrectionRole,
} from "@/lib/db/ops-follow-up-summary";

import type { DebateState, TurnContext } from "./run-simulation-types";

const OPEN_GAP_MARKERS =
  /\bUNRESOLVED\b|\*\*Disagree\*\*|\*\*Refine\*\*|\bmust be implemented\b|\bnot in any teammate/i;

export type OpsFollowUpSkipReason =
  | "not_software_template"
  | "not_returning_to_reviewer"
  | "already_triggered_for_reject_cluster"
  | "not_architect_correction_after_review"
  | "reject_target_is_devops"
  | "missing_reviewer_feedback"
  | "no_unresolved_devops_issues"
  | "devops_correction_cap_reached"
  | "insufficient_turn_budget";

export interface OpsFollowUpEvaluation {
  readonly shouldTrigger: boolean;
  readonly skipReason: OpsFollowUpSkipReason | null;
  readonly unresolvedDevOpsIssueCount: number;
  readonly blockers: readonly string[];
}

export interface FocusedOpsFollowUpContext {
  readonly reviewerName: string;
  readonly blockers: readonly string[];
  readonly reviewerFeedback: string;
  readonly architectCorrectionExcerpt: string | null;
}

function splitFeedbackIntoCandidates(feedbackText: string): string[] {
  return feedbackText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 20);
}

function isOpenIssueStatus(status: ReviewIssue["status"]): boolean {
  return status === "open" || status === "still_open" || status === "attempted";
}

export function getUnresolvedDevOpsIssues(
  reviewIssues: readonly ReviewIssue[],
): ReviewIssue[] {
  return reviewIssues.filter(
    (issue) => issue.targetRole === "devops" && isOpenIssueStatus(issue.status),
  );
}

export function extractDevOpsOwnedOperationalBlockers(
  feedbackText: string,
  roster: TeamRoster,
  rejectRole: SimulationAgentRole,
): string[] {
  const blockers: string[] = [];
  const seen = new Set<string>();

  for (const line of splitFeedbackIntoCandidates(feedbackText)) {
    if (!matchesOperationalCategory(line)) {
      continue;
    }
    if (!OPEN_GAP_MARKERS.test(line) && !isDevOpsOwnedConcern(line, roster, rejectRole)) {
      continue;
    }
    if (!isDevOpsOwnedConcern(line, roster, rejectRole)) {
      continue;
    }

    const normalized = line.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    blockers.push(line);
  }

  return blockers;
}

export function collectUnresolvedDevOpsBlockers(
  reviewIssues: readonly ReviewIssue[],
  reviewerFeedback: string | null,
  roster: TeamRoster,
  rejectRole: SimulationAgentRole | null,
): string[] {
  const blockers: string[] = [];
  const seen = new Set<string>();

  for (const issue of getUnresolvedDevOpsIssues(reviewIssues)) {
    const normalized = issue.excerpt.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      blockers.push(issue.excerpt);
    }
  }

  if (reviewerFeedback && rejectRole) {
    for (const line of extractDevOpsOwnedOperationalBlockers(
      reviewerFeedback,
      roster,
      rejectRole,
    )) {
      const normalized = line.toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        blockers.push(line);
      }
    }
  }

  return blockers;
}

export function hasOperationalOpenGaps(
  reviewIssues: readonly ReviewIssue[],
  reviewerFeedback: string | null,
  roster: TeamRoster,
  rejectRole: SimulationAgentRole | null,
): boolean {
  return collectUnresolvedDevOpsBlockers(
    reviewIssues,
    reviewerFeedback,
    roster,
    rejectRole,
  ).length > 0;
}

export function canScheduleOpsFollowUp(
  turnCount: number,
  maxTurns: number,
): boolean {
  return canScheduleArchitectRevision(turnCount, maxTurns);
}

export function isArchitectCorrectionAfterReview(
  transcript: readonly TranscriptEntry[],
): boolean {
  if (transcript.length < 2) {
    return false;
  }

  const lastEntry = transcript[transcript.length - 1];
  const previousEntry = transcript[transcript.length - 2];

  if (lastEntry?.role !== "architect" || previousEntry?.role !== "reviewer") {
    return false;
  }

  if (lastEntry.isCorrectionFailed) {
    return false;
  }

  return true;
}

export function isSoftwareTemplate(templateId: TeamTemplateId): boolean {
  return templateId !== "physical";
}

function getArchitectCorrectionExcerpt(
  transcript: readonly TranscriptEntry[],
): string | null {
  const lastEntry = transcript[transcript.length - 1];
  if (lastEntry?.role !== "architect") {
    return null;
  }
  const excerpt = lastEntry.content.trim();
  if (excerpt.length <= 600) {
    return excerpt;
  }
  return `${excerpt.slice(0, 600).trimEnd()}…`;
}

export function evaluateOpsFollowUpTrigger(
  state: DebateState,
  ctx: TurnContext,
): OpsFollowUpEvaluation {
  const blockers = collectUnresolvedDevOpsBlockers(
    state.reviewIssues,
    state.lastRejectFeedback,
    ctx.roster,
    state.lastRejectTarget,
  );

  const baseEvaluation = (skipReason: OpsFollowUpSkipReason): OpsFollowUpEvaluation => ({
    shouldTrigger: false,
    skipReason,
    unresolvedDevOpsIssueCount: blockers.length,
    blockers,
  });

  if (!isSoftwareTemplate(ctx.templateId)) {
    return baseEvaluation("not_software_template");
  }

  if (!state.returnToReviewer) {
    return baseEvaluation("not_returning_to_reviewer");
  }

  if (state.hasHadOpsFollowUpForCurrentReject) {
    return baseEvaluation("already_triggered_for_reject_cluster");
  }

  if (!isArchitectCorrectionAfterReview(state.transcript)) {
    const lastEntry = state.transcript[state.transcript.length - 1];
    const isFailedArchitectCorrection =
      lastEntry?.role === "architect" && lastEntry.isCorrectionFailed === true;

    // Failed architect corrections never unlock ops follow-up.
    if (isFailedArchitectCorrection) {
      return baseEvaluation("not_architect_correction_after_review");
    }

    // When no blockers remain and DevOps has not followed up for this reject cluster,
    // fall through and trigger — do not require architect correction.
    if (blockers.length === 0) {
      return baseEvaluation("not_architect_correction_after_review");
    }
  }

  if (state.lastRejectTarget === "devops") {
    return baseEvaluation("reject_target_is_devops");
  }

  if (!state.lastRejectFeedback?.trim()) {
    return baseEvaluation("missing_reviewer_feedback");
  }

  if (blockers.length === 0) {
    return baseEvaluation("no_unresolved_devops_issues");
  }

  if (!canCorrectRole(state.roleCorrectionCounts, "devops")) {
    return baseEvaluation("devops_correction_cap_reached");
  }

  const maxTurns = getMaxSimulationTurns(ctx.templateId);
  const remainingBudget = maxTurns - state.turnCount;
  // Near-cap escape: allow a focused DevOps turn when the normal revision
  // finish budget (4 turns) would block, as long as devops + re-review fit.
  if (!canScheduleOpsFollowUp(state.turnCount, maxTurns) && remainingBudget < 2) {
    return baseEvaluation("insufficient_turn_budget");
  }

  return {
    shouldTrigger: true,
    skipReason: null,
    unresolvedDevOpsIssueCount: blockers.length,
    blockers,
  };
}

export function shouldTriggerOpsFollowUp(
  state: DebateState,
  ctx: TurnContext,
): boolean {
  return evaluateOpsFollowUpTrigger(state, ctx).shouldTrigger;
}

export function resolveLastCorrectionRole(
  transcript: readonly TranscriptEntry[],
): OpsFollowUpLastCorrectionRole | null {
  if (transcript.length < 2) {
    return null;
  }

  const lastEntry = transcript[transcript.length - 1];
  const previousEntry = transcript[transcript.length - 2];

  if (previousEntry?.role !== "reviewer" || !lastEntry) {
    return null;
  }

  if (
    lastEntry.role === "architect" ||
    lastEntry.role === "backend" ||
    lastEntry.role === "frontend" ||
    lastEntry.role === "devops"
  ) {
    return lastEntry.role;
  }

  return "unknown";
}

const ELIGIBLE_BLOCKING_SKIP_REASONS = new Set<OpsFollowUpSkipReason>([
  "insufficient_turn_budget",
  "devops_correction_cap_reached",
  "already_triggered_for_reject_cluster",
]);

export function isOpsFollowUpEligible(
  evaluation: OpsFollowUpEvaluation,
  lastCorrectionRole: OpsFollowUpLastCorrectionRole,
): boolean {
  if (evaluation.shouldTrigger) {
    return true;
  }

  if (lastCorrectionRole !== "architect") {
    return false;
  }

  if (evaluation.unresolvedDevOpsIssueCount === 0) {
    return false;
  }

  if (
    evaluation.skipReason !== null &&
    ELIGIBLE_BLOCKING_SKIP_REASONS.has(evaluation.skipReason)
  ) {
    return true;
  }

  return false;
}

export interface OpsFollowUpSummary {
  readonly last: OpsFollowUpCheckpoint | null;
  readonly relevantArchitect: OpsFollowUpCheckpoint | null;
}

export function selectOpsFollowUpSummary(
  checkpoints: readonly OpsFollowUpCheckpoint[],
): OpsFollowUpSummary {
  if (checkpoints.length === 0) {
    return { last: null, relevantArchitect: null };
  }

  const last = checkpoints[checkpoints.length - 1] ?? null;

  let relevantArchitect: OpsFollowUpCheckpoint | null = null;
  for (let i = checkpoints.length - 1; i >= 0; i -= 1) {
    if (checkpoints[i]?.opsFollowUpLastCorrectionRole === "architect") {
      relevantArchitect = checkpoints[i] ?? null;
      break;
    }
  }

  return { last, relevantArchitect };
}

export function recordOpsFollowUpCheckpoint(
  state: DebateState,
  ctx: TurnContext,
): OpsFollowUpEvaluation | null {
  const lastCorrectionRole = resolveLastCorrectionRole(state.transcript);
  if (!lastCorrectionRole) {
    return null;
  }

  const evaluation = evaluateOpsFollowUpTrigger(state, ctx);
  const checkpoint: OpsFollowUpCheckpoint = {
    opsFollowUpEvaluated: true,
    opsFollowUpTriggered: evaluation.shouldTrigger,
    opsFollowUpSkipReason: evaluation.skipReason,
    opsFollowUpEligible: isOpsFollowUpEligible(evaluation, lastCorrectionRole),
    opsFollowUpUnresolvedDevopsIssueCount: evaluation.unresolvedDevOpsIssueCount,
    opsFollowUpLastCorrectionRole: lastCorrectionRole,
    opsFollowUpEvaluationTurn: state.turnCount,
  };

  state.opsFollowUpCheckpoints.push(checkpoint);
  state.opsFollowUpCheckpoint = checkpoint;
  return evaluation;
}

export function buildFocusedOpsFollowUpContext(
  roster: TeamRoster,
  reviewerFeedback: string,
  blockers: readonly string[],
  architectCorrectionExcerpt: string | null,
): FocusedOpsFollowUpContext {
  const reviewerMember = getTeamMember(roster, "reviewer");

  return {
    reviewerName: reviewerMember.name,
    blockers,
    reviewerFeedback,
    architectCorrectionExcerpt,
  };
}

export function buildFocusedOpsFollowUpPrompt(
  context: FocusedOpsFollowUpContext,
): string {
  const blockerList =
    context.blockers.length > 0
      ? context.blockers.map((blocker, index) => `${index + 1}. ${blocker}`).join("\n")
      : "See reviewer operational concerns in the transcript.";

  const architectContext = context.architectCorrectionExcerpt
    ? `\nArchitect correction already delivered (do not repeat):\n${context.architectCorrectionExcerpt}\n`
    : "";

  return `

CRITICAL — FOCUSED OPERATIONAL CLOSURE TURN

${context.reviewerName} flagged DevOps/operations gaps that remain open after the architect's correction. Address ONLY the remaining operational closure blockers below — do not reopen the full system design.
${architectContext}
Remaining operational closure blockers:
${blockerList}

Scope rules:
- Cover only: backup/restore validation, monitoring/alerting, queue/worker hardening, deployment ordering, runtime resilience, and operational acceptance criteria.
- Do NOT restate the full architecture or repeat the architect's prior proposal verbatim.
- Start with an "## Operational Closure" section listing concrete mitigations with acceptance criteria for each blocker above.
- Keep cross-critique brief; prioritize closing the operational gaps the reviewer assigned to DevOps.`;
}

export function markDevOpsOperationalIssuesAttempted(
  issues: ReviewIssue[],
  turnCount: number,
): void {
  for (const issue of issues) {
    if (issue.targetRole !== "devops") {
      continue;
    }
    if (issue.status === "open" || issue.status === "still_open") {
      issue.status = "attempted";
      issue.lastAttemptedOnTurn = turnCount;
    }
  }
}

export function scheduleOpsFollowUpTurn(
  state: DebateState,
  ctx: TurnContext,
  evaluation: OpsFollowUpEvaluation,
): void {
  state.focusedOpsFollowUp = buildFocusedOpsFollowUpContext(
    ctx.roster,
    state.lastRejectFeedback ?? "",
    evaluation.blockers,
    getArchitectCorrectionExcerpt(state.transcript),
  );
  state.hasHadOpsFollowUpForCurrentReject = true;
  state.nextRole = "devops" satisfies SimulationAgentRole;
  state.returnToReviewer = true;
}

export {
  inferIssueOwnerFromConcern,
  matchesOperationalCategory,
} from "@/ai/orchestration/issue-ownership";
