import type { SimulationAgentRole } from "@/ai/agents/config";
import type { ReviewIssue } from "@/ai/orchestration/review-issue-tracker";
import { canApproveWithFullParticipation } from "@/ai/orchestration/role-participation";
import type { TranscriptEntry } from "@/ai/context/transcript";

/** Unproductive reject→correct cycles before preferring approve. */
export const UNPRODUCTIVE_CORRECTION_LOOP_THRESHOLD = 3;

/** Max corrections allowed for any single role (stricter than soft mid-debate). */
export const HARD_MAX_CORRECTIONS_PER_ROLE = 3;

export interface CorrectionLoopState {
  /** Consecutive reject cycles that only re-opened still_open issues. */
  consecutiveUnproductiveCycles: number;
  correctionLoopDetected: boolean;
  lastRejectRole: SimulationAgentRole | null;
  lastRejectKeywordKey: string | null;
}

export function createCorrectionLoopState(): CorrectionLoopState {
  return {
    consecutiveUnproductiveCycles: 0,
    correctionLoopDetected: false,
    lastRejectRole: null,
    lastRejectKeywordKey: null,
  };
}

function keywordKey(keywords: readonly string[]): string {
  return keywords.slice(0, 4).join("|");
}

/**
 * True when this reject largely restates an already-open / still_open issue
 * for the same role (ping-pong / duplicate rejection).
 */
export function isDuplicateRejectReason(params: {
  readonly rejectRole: SimulationAgentRole;
  readonly feedbackText: string;
  readonly reviewIssues: readonly ReviewIssue[];
}): boolean {
  const openForRole = params.reviewIssues.filter(
    (issue) =>
      issue.targetRole === params.rejectRole &&
      (issue.status === "open" ||
        issue.status === "still_open" ||
        issue.status === "attempted"),
  );
  if (openForRole.length === 0) {
    return false;
  }

  const feedbackLower = params.feedbackText.toLowerCase();
  return openForRole.some((issue) => {
    const hits = issue.keywords.filter((kw) => feedbackLower.includes(kw));
    return hits.length >= Math.min(2, issue.keywords.length);
  });
}

/**
 * Record a reject cycle. Returns whether a correction loop should force approve.
 */
export function recordRejectCycle(
  loop: CorrectionLoopState,
  params: {
    readonly rejectRole: SimulationAgentRole;
    readonly feedbackText: string;
    readonly reviewIssues: readonly ReviewIssue[];
    readonly newIssueCount: number;
  },
): CorrectionLoopState {
  const isDuplicate = isDuplicateRejectReason({
    rejectRole: params.rejectRole,
    feedbackText: params.feedbackText,
    reviewIssues: params.reviewIssues,
  });
  const unproductive = isDuplicate || params.newIssueCount === 0;
  const consecutiveUnproductiveCycles = unproductive
    ? loop.consecutiveUnproductiveCycles + 1
    : 0;

  const correctionLoopDetected =
    consecutiveUnproductiveCycles >= UNPRODUCTIVE_CORRECTION_LOOP_THRESHOLD;

  return {
    consecutiveUnproductiveCycles,
    correctionLoopDetected: loop.correctionLoopDetected || correctionLoopDetected,
    lastRejectRole: params.rejectRole,
    lastRejectKeywordKey: keywordKey(
      params.feedbackText
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length >= 4)
        .slice(0, 4),
    ),
  };
}

export function shouldPreferCorrectionLoopApprove(params: {
  readonly transcript: readonly TranscriptEntry[];
  readonly correctionLoopDetected: boolean;
  readonly unresolvedOpsIssueCount: number;
}): boolean {
  if (!params.correctionLoopDetected) {
    return false;
  }
  if (!canApproveWithFullParticipation(params.transcript)) {
    return false;
  }
  // Ops follow-up should still run; do not loop-approve over open ops.
  if (params.unresolvedOpsIssueCount > 0) {
    return false;
  }
  return true;
}

export function hasReachedHardCorrectionLimit(
  counts: Readonly<Partial<Record<SimulationAgentRole, number>>>,
  role: SimulationAgentRole,
): boolean {
  return (counts[role] ?? 0) >= HARD_MAX_CORRECTIONS_PER_ROLE;
}
