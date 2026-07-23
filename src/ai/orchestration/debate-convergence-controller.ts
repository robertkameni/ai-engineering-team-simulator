import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { TranscriptEntry } from "@/ai/context/transcript";
import { getUnresolvedDevOpsIssues } from "@/ai/orchestration/ops-follow-up";
import {
  canApproveWithFullParticipation,
  listMissingPipelineRoles,
} from "@/ai/orchestration/role-participation";
import {
  applyPostApproveTruncationFlags,
  getLatestTruncatedCriticalRoles,
  syncHasTruncatedCriticalTurn,
} from "@/ai/orchestration/truncation-approval-gate";
import type {
  ReviewIssue,
  ReviewIssueBaseline,
} from "@/ai/orchestration/review-issue-tracker";

export type DebatePhase =
  | "initial_delivery"
  | "initial_review"
  | "correction_wave"
  | "ops_closure"
  | "final_review"
  | "finalized";

export type ReviewerProposalDecision = "approve" | "reject" | "unknown";

export interface ReviewerTurnProposal {
  decision: ReviewerProposalDecision;
  feedbackText: string;
  rejectRole?: SimulationAgentRole;
  scopedRejectRole?: SimulationAgentRole;
  source: "reviewer" | "synthetic";
  issuedOnTurn: number;
}

export type AcceptedCriticalRiskCategory =
  | "security"
  | "data_loss"
  | "architectural_impossibility";

export interface AcceptedCriticalRisk {
  issueId: string;
  targetRole: SimulationAgentRole;
  category: AcceptedCriticalRiskCategory;
  excerpt: string;
  acceptedOnTurn: number;
}

export interface DebateFinalizationProposal {
  outcome: "approved";
  acceptedCriticalRisks: AcceptedCriticalRisk[];
  acceptedIssueIds: string[];
  reason: string;
}

export interface DebateConvergenceState {
  phase: DebatePhase;
  turnCount: number;
  transcript: TranscriptEntry[];
  lastRejectFeedback: string | null;
  lastRejectTarget: SimulationAgentRole | null;
  reviewerRejectionCount: number;
  roleCorrectionCounts: Partial<Record<SimulationAgentRole, number>>;
  reviewIssues: ReviewIssue[];
  reviewIssueBaseline: ReviewIssueBaseline | null;
  hasTruncatedCriticalTurn: boolean;
  postApproveTruncation: boolean;
  /** True when pre-approval truncation recovery still left a truncated turn. */
  truncationRetried: boolean;
  postApproveContinuationFailed: boolean;
  truncationRecoveryAttemptedRoles: SimulationAgentRole[];
  hasHadOpsFollowUpForCurrentReject: boolean;
  reviewerProposal: ReviewerTurnProposal | null;
  finalizationProposal: DebateFinalizationProposal | null;
}

export type DebateConvergenceDirective =
  | { kind: "schedule_turn"; phase: DebatePhase; role: SimulationAgentRole }
  | {
      kind: "finalize";
      phase: "finalized";
      outcome: "approved";
      acceptedCriticalRisks: AcceptedCriticalRisk[];
    };

const DELIVERY_ROLES = [
  "pm",
  "architect",
  "backend",
  "frontend",
  "devops",
] as const satisfies readonly SimulationAgentRole[];

const SOFTWARE_MAX_TURNS = 10;
const PHYSICAL_MAX_TURNS = 16;
const SOFTWARE_MAX_REVIEWER_REJECTIONS = 5;
const SOFTWARE_MAX_CORRECTIONS_PER_ROLE = 3;
const SOFTWARE_FINALIZATION_PRIORITY_TURN = 8;
const SOFTWARE_MAX_TARGETED_TURNS = 2;

function countReviewerTurns(transcript: readonly TranscriptEntry[]): number {
  return transcript.filter((entry) => entry.role === "reviewer").length;
}

function countTargetedTurnsAfterInitialReview(
  transcript: readonly TranscriptEntry[],
): number {
  const firstReviewerIndex = transcript.findIndex((entry) => entry.role === "reviewer");
  if (firstReviewerIndex < 0) {
    return 0;
  }

  return transcript
    .slice(firstReviewerIndex + 1)
    .filter((entry) => entry.role !== "reviewer").length;
}

function nextInitialDeliveryRole(
  transcript: readonly TranscriptEntry[],
): SimulationAgentRole | null {
  const missing = listMissingPipelineRoles(transcript);
  if (missing.length === 0) {
    return null;
  }

  for (const role of DELIVERY_ROLES) {
    if (missing.includes(role)) {
      return role;
    }
  }

  return missing[0] ?? null;
}

function getMaxTurns(templateId: TeamTemplateId): number {
  return templateId === "physical" ? PHYSICAL_MAX_TURNS : SOFTWARE_MAX_TURNS;
}

function isSoftwareBoundedTemplate(templateId: TeamTemplateId): boolean {
  return templateId !== "physical";
}

function shouldScheduleOpsClosure(state: DebateConvergenceState): boolean {
  if (state.hasHadOpsFollowUpForCurrentReject) {
    return false;
  }
  if (state.lastRejectTarget === "devops") {
    return false;
  }
  if (getUnresolvedDevOpsIssues(state.reviewIssues).length === 0) {
    return false;
  }

  const lastRole = state.transcript[state.transcript.length - 1]?.role;
  return lastRole === "architect";
}

function getRejectTarget(
  state: DebateConvergenceState,
): SimulationAgentRole | null {
  return (
    state.reviewerProposal?.scopedRejectRole ??
    state.reviewerProposal?.rejectRole ??
    state.lastRejectTarget
  );
}

function shouldAdvanceToSoftwareFinalReview(
  state: DebateConvergenceState,
  targetRole: SimulationAgentRole | null,
): boolean {
  if (state.turnCount >= SOFTWARE_FINALIZATION_PRIORITY_TURN) {
    return true;
  }
  if (countTargetedTurnsAfterInitialReview(state.transcript) >= SOFTWARE_MAX_TARGETED_TURNS) {
    return true;
  }
  if (state.reviewerRejectionCount >= SOFTWARE_MAX_REVIEWER_REJECTIONS) {
    return true;
  }
  if (targetRole && (state.roleCorrectionCounts[targetRole] ?? 0) >= SOFTWARE_MAX_CORRECTIONS_PER_ROLE) {
    return true;
  }
  return false;
}

function classifyCriticalRiskCategory(
  issue: ReviewIssue,
): AcceptedCriticalRiskCategory | null {
  const text = `${issue.excerpt} ${issue.keywords.join(" ")}`.toLowerCase();

  if (
    /\b(security|auth|authentication|authorization|permission|secret|token|injection|idor|xss|csrf|privilege|encrypt)\b/.test(
      text,
    )
  ) {
    return "security";
  }

  if (
    /\b(data loss|dataloss|backup|restore|recovery|corrupt|corruption|durability|drop table|lost data|destructive migration)\b/.test(
      text,
    )
  ) {
    return "data_loss";
  }

  if (
    /\b(impossible|cannot implement|can't implement|not feasible|architectural impossibility|contradictory architecture|incompatible architecture)\b/.test(
      text,
    )
  ) {
    return "architectural_impossibility";
  }

  return null;
}

function applyFinalization(
  state: DebateConvergenceState,
  acceptedOnTurn: number,
  reason: string,
): DebateConvergenceDirective {
  const acceptedCriticalRisks: AcceptedCriticalRisk[] = [];
  const acceptedIssueIds: string[] = [];

  for (const issue of state.reviewIssues) {
    if (issue.status !== "open") {
      continue;
    }

    const category = classifyCriticalRiskCategory(issue);
    const acceptedReason = category
      ? `Accepted ${category.replaceAll("_", " ")} risk during deterministic debate finalization.`
      : "Accepted residual non-critical review risk during deterministic debate finalization.";

    issue.status = "accepted_risk";
    issue.acceptedRisk = {
      reason: acceptedReason,
      acceptedByRole: "reviewer",
      acceptedOnTurn,
      metadata: {
        source: "debate_convergence_controller",
        criticalCategory: category ?? "none",
      },
    };

    acceptedIssueIds.push(issue.id);
    if (category) {
      acceptedCriticalRisks.push({
        issueId: issue.id,
        targetRole: issue.targetRole,
        category,
        excerpt: issue.excerpt,
        acceptedOnTurn,
      });
    }
  }

  state.phase = "finalized";
  state.finalizationProposal = {
    outcome: "approved",
    acceptedCriticalRisks,
    acceptedIssueIds,
    reason,
  };

  return {
    kind: "finalize",
    phase: "finalized",
    outcome: "approved",
    acceptedCriticalRisks,
  };
}

function maybeScheduleApprovedRecovery(
  state: DebateConvergenceState,
): DebateConvergenceDirective | null {
  syncHasTruncatedCriticalTurn(state, state.transcript);
  const truncatedRoles = getLatestTruncatedCriticalRoles(state.transcript);
  if (truncatedRoles.length === 0) {
    state.postApproveTruncation = false;
    state.hasTruncatedCriticalTurn = false;
    if (state.truncationRecoveryAttemptedRoles.length > 0) {
      state.postApproveContinuationFailed = false;
    }
    return null;
  }

  const recoverableRole = truncatedRoles.find(
    (role) => !state.truncationRecoveryAttemptedRoles.includes(role),
  );
  if (!recoverableRole) {
    state.postApproveTruncation = true;
    state.hasTruncatedCriticalTurn = true;
    if (state.truncationRecoveryAttemptedRoles.length > 0) {
      state.postApproveContinuationFailed = true;
    }
    return null;
  }

  state.truncationRecoveryAttemptedRoles = [
    ...state.truncationRecoveryAttemptedRoles,
    recoverableRole,
  ];

  return {
    kind: "schedule_turn",
    phase: "correction_wave",
    role: recoverableRole,
  };
}

function syncApprovedFinalizationFlags(
  state: DebateConvergenceState,
): void {
  applyPostApproveTruncationFlags(state, state.transcript);
}

function decideApprovedPath(
  state: DebateConvergenceState,
  templateId: TeamTemplateId,
): DebateConvergenceDirective {
  if (!canApproveWithFullParticipation(state.transcript)) {
    const missingRole = nextInitialDeliveryRole(state.transcript);
    if (missingRole) {
      return {
        kind: "schedule_turn",
        phase: "initial_delivery",
        role: missingRole,
      };
    }
  }

  // Always attempt truncation recovery BEFORE finalization — including on
  // the software finalization-priority turn. Approving with truncated
  // critical turns is a defect; recovery must run first.
  const recoveryDirective = maybeScheduleApprovedRecovery(state);
  if (recoveryDirective) {
    return recoveryDirective;
  }

  if (isSoftwareBoundedTemplate(templateId) && state.turnCount >= SOFTWARE_FINALIZATION_PRIORITY_TURN) {
    syncApprovedFinalizationFlags(state);
    if (state.postApproveTruncation) {
      console.error(
        "TRUNCATION DEFECT: critical turn still truncated after recovery; finalizing with truncationRetried",
        {
          turnCount: state.turnCount,
          attemptedRoles: state.truncationRecoveryAttemptedRoles,
        },
      );
      state.truncationRetried = true;
    }
    return applyFinalization(
      state,
      state.turnCount,
      "Software debate reached deterministic finalization priority.",
    );
  }

  return applyFinalization(state, state.turnCount, "Reviewer approved debate closure.");
}

function decideInitialDeliveryOrReview(
  state: DebateConvergenceState,
): DebateConvergenceDirective | null {
  const deliveryRole = nextInitialDeliveryRole(state.transcript);
  if (deliveryRole) {
    state.phase = "initial_delivery";
    return { kind: "schedule_turn", phase: "initial_delivery", role: deliveryRole };
  }

  const reviewerTurns = countReviewerTurns(state.transcript);
  if (reviewerTurns === 0) {
    state.phase = "initial_review";
    return { kind: "schedule_turn", phase: "initial_review", role: "reviewer" };
  }

  return null;
}

function decideSoftwarePath(
  state: DebateConvergenceState,
): DebateConvergenceDirective {
  const initial = decideInitialDeliveryOrReview(state);
  if (initial) {
    return initial;
  }

  const reviewerTurns = countReviewerTurns(state.transcript);
  const proposal = state.reviewerProposal;
  if (proposal?.decision === "approve") {
    return decideApprovedPath(state, "software");
  }

  if (state.turnCount >= SOFTWARE_MAX_TURNS) {
    return applyFinalization(
      state,
      SOFTWARE_MAX_TURNS,
      "Software debate exhausted deterministic schedule.",
    );
  }

  if (state.phase === "final_review" || reviewerTurns >= 2) {
    return applyFinalization(
      state,
      state.turnCount,
      "Final review completed without further correction budget.",
    );
  }

  const targetRole = getRejectTarget(state);
  if (proposal?.decision === "reject") {
    if (shouldAdvanceToSoftwareFinalReview(state, targetRole)) {
      state.phase = "final_review";
      return { kind: "schedule_turn", phase: "final_review", role: "reviewer" };
    }

    if (shouldScheduleOpsClosure(state)) {
      state.phase = "ops_closure";
      return { kind: "schedule_turn", phase: "ops_closure", role: "devops" };
    }

    if (targetRole) {
      state.phase = "correction_wave";
      return { kind: "schedule_turn", phase: "correction_wave", role: targetRole };
    }
  }

  state.phase = "final_review";
  return { kind: "schedule_turn", phase: "final_review", role: "reviewer" };
}

function decidePhysicalPath(
  state: DebateConvergenceState,
  templateId: TeamTemplateId,
): DebateConvergenceDirective {
  const initial = decideInitialDeliveryOrReview(state);
  if (initial) {
    return initial;
  }

  const reviewerTurns = countReviewerTurns(state.transcript);
  const proposal = state.reviewerProposal;
  if (proposal?.decision === "approve") {
    return decideApprovedPath(state, templateId);
  }

  const maxTurns = getMaxTurns(templateId);
  if (state.turnCount >= maxTurns) {
    return applyFinalization(
      state,
      maxTurns,
      "Physical debate exhausted available turn budget.",
    );
  }

  const targetRole = getRejectTarget(state);
  const remainingTurns = maxTurns - state.turnCount;
  if (
    proposal?.decision === "reject" &&
    targetRole &&
    remainingTurns > 1 &&
    state.reviewerRejectionCount < SOFTWARE_MAX_REVIEWER_REJECTIONS &&
    (state.roleCorrectionCounts[targetRole] ?? 0) < SOFTWARE_MAX_CORRECTIONS_PER_ROLE
  ) {
    state.phase = "correction_wave";
    return { kind: "schedule_turn", phase: "correction_wave", role: targetRole };
  }

  if (reviewerTurns >= 2 || remainingTurns <= 1) {
    return applyFinalization(
      state,
      state.turnCount,
      "Physical debate reached final deterministic closure.",
    );
  }

  state.phase = "final_review";
  return { kind: "schedule_turn", phase: "final_review", role: "reviewer" };
}

export function decideDebateConvergence(
  state: DebateConvergenceState,
  params: { templateId: TeamTemplateId },
): DebateConvergenceDirective {
  if (isSoftwareBoundedTemplate(params.templateId)) {
    return decideSoftwarePath(state);
  }

  return decidePhysicalPath(state, params.templateId);
}
