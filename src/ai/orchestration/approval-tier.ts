import type { DebateExitOutcome } from "@/ai/orchestration/reviewer-decision";

/**
 * Approval quality tiers. The debate controller still finalizes as approved;
 * this layer maps residual risk / truncation into a consumer-facing tier and
 * outcome string so UI/export can distinguish clean vs soft-close.
 */
export type ApprovalTier = "clean" | "accepted_risks" | "forced_close";

export type ApprovedDebateOutcome =
  | "approved"
  | "approved_with_accepted_risks"
  | "approved_forced_close";

export function isApprovedDebateOutcome(
  outcome: DebateExitOutcome | null | undefined,
): outcome is ApprovedDebateOutcome {
  return (
    outcome === "approved" ||
    outcome === "approved_with_accepted_risks" ||
    outcome === "approved_forced_close"
  );
}

export function computeApprovalTier(params: {
  readonly acceptedCriticalRiskCount: number;
  readonly postApproveTruncation: boolean;
  readonly rejectCount: number;
  readonly truncationRetried?: boolean;
}): ApprovalTier {
  if (
    params.postApproveTruncation ||
    params.truncationRetried === true ||
    params.rejectCount >= 3 ||
    params.acceptedCriticalRiskCount >= 3
  ) {
    return "forced_close";
  }

  if (params.acceptedCriticalRiskCount >= 1) {
    return "accepted_risks";
  }

  return "clean";
}

export function debateOutcomeForApprovalTier(
  tier: ApprovalTier,
): ApprovedDebateOutcome {
  if (tier === "forced_close") {
    return "approved_forced_close";
  }
  if (tier === "accepted_risks") {
    return "approved_with_accepted_risks";
  }
  return "approved";
}

export function resolveApprovedDebateOutcome(params: {
  readonly acceptedCriticalRiskCount: number;
  readonly postApproveTruncation: boolean;
  readonly rejectCount: number;
  readonly truncationRetried?: boolean;
}): {
  readonly approvalTier: ApprovalTier;
  readonly debateOutcome: ApprovedDebateOutcome;
} {
  const approvalTier = computeApprovalTier(params);
  return {
    approvalTier,
    debateOutcome: debateOutcomeForApprovalTier(approvalTier),
  };
}
