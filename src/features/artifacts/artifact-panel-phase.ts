import { isApprovedDebateOutcome } from "@/ai/orchestration/approval-tier";
import { SIMULATION_AGENT_ORDER } from "@/ai/agents/config";
import { ARTIFACT_TYPES, CORE_ARTIFACT_TYPES } from "@/lib/artifact-constants";
import type { AgentRole, DebateExitOutcome } from "@/lib/types";
import type {
  ArtifactsPanelStatus,
  DebateProgress,
  PartialRunArtifacts,
} from "@/features/artifacts/types";
import { hasSynthesisValidationWarnings } from "@/features/artifacts/synthesis-validation";
import type { SynthesisValidationFlags } from "@/features/artifacts/synthesis-validation.types";

export function isUnapprovedDebateOutcome(
  outcome: DebateExitOutcome | null | undefined,
): outcome is "cap_reached" | "unknown_reject_fallback" | "reviewer_error" | "degraded_truncated" | "insufficient_budget" {
  return (
    outcome === "cap_reached" ||
    outcome === "unknown_reject_fallback" ||
    outcome === "reviewer_error" ||
    outcome === "degraded_truncated" ||
    outcome === "insufficient_budget"
  );
}

export function isSoftApprovedDebateOutcome(
  outcome: DebateExitOutcome | null | undefined,
): boolean {
  return (
    outcome === "approved_with_accepted_risks" ||
    outcome === "approved_forced_close"
  );
}

export function debateOutcomeWarningMessage(outcome: DebateExitOutcome): string {
  if (outcome === "cap_reached") {
    return "Debate hit the turn limit without [APPROVE]. Deliverables are provisional.";
  }
  if (outcome === "unknown_reject_fallback") {
    return "Reviewer did not return a valid decision before turns ended. Deliverables are provisional.";
  }
  if (outcome === "reviewer_error") {
    return "Reviewer turn failed unexpectedly. Debate was closed without review. Deliverables are unverified.";
  }
  if (outcome === "degraded_truncated") {
    return "Reviewer approved but critical agent turns were truncated. Deliverables are degraded — some sections may be incomplete.";
  }
  if (outcome === "insufficient_budget") {
    return "Insufficient remaining turns for a complete correction cycle. Debate closed with open review gaps preserved.";
  }
  if (outcome === "approved_with_accepted_risks") {
    return "Approved with accepted critical risks documented as known issues — not fully resolved in debate.";
  }
  if (outcome === "approved_forced_close") {
    return "Forced close: approval after truncation recovery and/or multiple accepted critical risks / rejects.";
  }
  return "";
}

export function debateOutcomeLabel(outcome: DebateExitOutcome): string {
  if (outcome === "approved") return "Approved";
  if (outcome === "approved_with_accepted_risks") {
    return "Approved with accepted risks";
  }
  if (outcome === "approved_forced_close") return "Approved (forced close)";
  if (outcome === "cap_reached") return "Turn limit reached";
  if (outcome === "unknown_reject_fallback") return "Reviewer decision unclear";
  if (outcome === "reviewer_error") return "Reviewer error";
  if (outcome === "degraded_truncated") return "Degraded — truncated turns";
  if (outcome === "insufficient_budget") return "Insufficient closure budget";
  return outcome;
}

export function countRunArtifacts(
  artifacts: PartialRunArtifacts | null | undefined,
): number {
  if (!artifacts) return 0;
  return ARTIFACT_TYPES.filter((type) => artifacts[type] != null).length;
}

function countCoreArtifacts(
  artifacts: PartialRunArtifacts | null | undefined,
): number {
  if (!artifacts) return 0;
  return CORE_ARTIFACT_TYPES.filter((type) => artifacts[type] != null).length;
}

function hasCoreArtifacts(
  artifacts: PartialRunArtifacts | null | undefined,
): boolean {
  return countCoreArtifacts(artifacts) === CORE_ARTIFACT_TYPES.length;
}

/**
 * Approved runs must ship all core artifacts. Prevents the food-run failure
 * mode (Approved + 0/5 in export) when synthesis has not completed.
 */
export function canExportApprovedRun(params: {
  readonly debateOutcome: DebateExitOutcome | null | undefined;
  readonly artifacts: PartialRunArtifacts | null | undefined;
}): boolean {
  if (!isApprovedDebateOutcome(params.debateOutcome)) {
    return true;
  }
  return hasCoreArtifacts(params.artifacts);
}

export function shouldShowArtifactTabs(
  status: ArtifactsPanelStatus,
  artifacts: PartialRunArtifacts | null | undefined,
): boolean {
  const totalCount = countRunArtifacts(artifacts);
  if (totalCount === 0) return false;
  if (status === "generating") return totalCount > 0;
  return status === "ready" && hasCoreArtifacts(artifacts);
}

export function artifactPanelSubtitle(
  status: ArtifactsPanelStatus,
  debateProgress?: DebateProgress,
  artifactCount?: number,
  debateOutcome?: DebateExitOutcome | null,
  synthesisValidation?: SynthesisValidationFlags | null,
): string {
  switch (status) {
    case "pending":
      if (debateProgress && debateProgress.completed > 0) {
        return `Discussion · ${debateProgress.completed} turn${debateProgress.completed === 1 ? "" : "s"}`;
      }
      return "Phase 1 · waiting for debate";
    case "generating":
      if (artifactCount != null && artifactCount > 0) {
        return `Phase 2 · ${artifactCount} of ${CORE_ARTIFACT_TYPES.length} core deliverables ready`;
      }
      return "Phase 2 · synthesizing deliverables";
    case "ready":
      if (isUnapprovedDebateOutcome(debateOutcome)) {
        return "Phase 3 · Finished with open risks (unapproved)";
      }
      if (debateOutcome === "approved_forced_close") {
        return "Phase 3 · ready (forced close)";
      }
      if (debateOutcome === "approved_with_accepted_risks") {
        return "Phase 3 · ready with accepted risks";
      }
      if (hasSynthesisValidationWarnings(synthesisValidation)) {
        return "Phase 3 · ready with validation warnings";
      }
      return "Phase 3 · ready to review";
    case "unavailable":
      return "Deliverables unavailable";
    default:
      return "Structured outputs from the team";
  }
}

export function debateProgressFromMessages(
  messages: { role: AgentRole; isStreaming?: boolean; }[],
  activeAgent: AgentRole | null,
): DebateProgress {
  const completed = messages.filter((message) => !message.isStreaming).length;

  return {
    completed,
    total: SIMULATION_AGENT_ORDER.length,
    activeRole: activeAgent,
  };
}
