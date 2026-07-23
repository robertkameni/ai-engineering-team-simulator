import type { TranscriptEntry } from "@/ai/context/transcript";
import {
  evaluateOpsFollowUpTrigger,
  type OpsFollowUpEvaluation,
  type OpsFollowUpSkipReason,
} from "@/ai/orchestration/ops-follow-up";
import type { ReviewIssue } from "@/ai/orchestration/review-issue-tracker";
import type {
  DebateState,
  TurnContext,
} from "@/ai/orchestration/run-simulation-types";
import type {
  OpsFollowUpCheckpoint,
  OpsFollowUpLastCorrectionRole,
} from "@/lib/db/ops-follow-up-summary";

const ELIGIBLE_BLOCKING_SKIP_REASONS = new Set<OpsFollowUpSkipReason>([
  "insufficient_turn_budget",
  "devops_correction_cap_reached",
  "already_triggered_for_reject_cluster",
]);

export interface OpsFollowUpSummary {
  readonly last: OpsFollowUpCheckpoint | null;
  readonly relevantArchitect: OpsFollowUpCheckpoint | null;
}

interface DevOpsIssueStatusSummary {
  readonly openCount: number;
  readonly addressedCount: number;
  readonly acceptedRiskCount: number;
  readonly acceptedRiskReasons: string[];
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

function isOpsFollowUpEligible(
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

  return (
    evaluation.skipReason !== null &&
    ELIGIBLE_BLOCKING_SKIP_REASONS.has(evaluation.skipReason)
  );
}

function summarizeDevOpsIssueStatuses(
  reviewIssues: readonly ReviewIssue[],
): DevOpsIssueStatusSummary {
  const acceptedRiskReasons = new Set<string>();
  let openCount = 0;
  let addressedCount = 0;
  let acceptedRiskCount = 0;

  for (const issue of reviewIssues) {
    if (issue.targetRole !== "devops") {
      continue;
    }

    if (issue.status === "open") {
      openCount += 1;
      continue;
    }

    if (issue.status === "addressed") {
      addressedCount += 1;
      continue;
    }

    acceptedRiskCount += 1;
    const reason = issue.acceptedRisk?.reason?.trim();
    if (reason) {
      acceptedRiskReasons.add(reason);
    }
  }

  return {
    openCount,
    addressedCount,
    acceptedRiskCount,
    acceptedRiskReasons: [...acceptedRiskReasons],
  };
}

export function selectOpsFollowUpSummary(
  checkpoints: readonly OpsFollowUpCheckpoint[],
): OpsFollowUpSummary {
  if (checkpoints.length === 0) {
    return { last: null, relevantArchitect: null };
  }

  const last = checkpoints[checkpoints.length - 1] ?? null;
  let relevantArchitect: OpsFollowUpCheckpoint | null = null;
  for (let index = checkpoints.length - 1; index >= 0; index -= 1) {
    if (checkpoints[index]?.opsFollowUpLastCorrectionRole === "architect") {
      relevantArchitect = checkpoints[index] ?? null;
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
  const issueStatusSummary = summarizeDevOpsIssueStatuses(state.reviewIssues);
  const checkpoint: OpsFollowUpCheckpoint = {
    opsFollowUpEvaluated: true,
    opsFollowUpTriggered: evaluation.shouldTrigger,
    opsFollowUpSkipReason: evaluation.skipReason,
    opsFollowUpEligible: isOpsFollowUpEligible(evaluation, lastCorrectionRole),
    opsFollowUpUnresolvedDevopsIssueCount: issueStatusSummary.openCount,
    opsFollowUpOpenIssueCount: issueStatusSummary.openCount,
    opsFollowUpAddressedIssueCount: issueStatusSummary.addressedCount,
    opsFollowUpAcceptedRiskIssueCount: issueStatusSummary.acceptedRiskCount,
    opsFollowUpAcceptedRiskReasons: issueStatusSummary.acceptedRiskReasons,
    opsFollowUpLastCorrectionRole: lastCorrectionRole,
    opsFollowUpEvaluationTurn: state.turnCount,
  };

  state.opsFollowUpCheckpoints.push(checkpoint);
  state.opsFollowUpCheckpoint = checkpoint;
  return evaluation;
}
