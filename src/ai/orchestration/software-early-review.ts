import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { TranscriptEntry } from "@/ai/context/transcript";

export function frontendHasSpoken(
  transcript: readonly TranscriptEntry[],
): boolean {
  return transcript.some((entry) => entry.role === "frontend");
}

export function roleHasSpoken(
  transcript: readonly TranscriptEntry[],
  role: SimulationAgentRole,
): boolean {
  return transcript.some((entry) => entry.role === role);
}

export interface EarlyReviewGateState {
  readonly hasHadEarlyReview: boolean;
  readonly nextRole: SimulationAgentRole;
  readonly returnToReviewer: boolean;
  readonly isArchitectRevision: boolean;
  readonly transcript: readonly TranscriptEntry[];
}

/**
 * Software/hybrid early review may fire only after Frontend has spoken.
 * Physical templates never use early review.
 *
 * Previously this gated on `nextRole === "backend"`, which fired *after*
 * the backend turn (nextRole still "backend") — before FE/DevOps — and
 * started the correction-burn cascade.
 */
export function shouldTriggerSoftwareEarlyReview(
  state: EarlyReviewGateState,
  templateId: TeamTemplateId,
): boolean {
  if (templateId === "physical") {
    return false;
  }

  if (state.hasHadEarlyReview) {
    return false;
  }

  if (state.nextRole === "reviewer") {
    return false;
  }

  if (state.returnToReviewer) {
    return false;
  }

  if (state.isArchitectRevision) {
    return false;
  }

  if (!roleHasSpoken(state.transcript, "architect")) {
    return false;
  }

  if (!frontendHasSpoken(state.transcript)) {
    return false;
  }

  // Fire once Frontend has spoken and the pipeline is advancing toward DevOps.
  if (state.nextRole !== "frontend") {
    return false;
  }

  return true;
}
