import { isDebateComplete } from "@/ai/orchestration/reviewer-decision";
import type { RegenerateRunArtifactsError } from "@/ai/artifacts/regenerate-run-artifacts.types";
import type { RunStatus as AppRunStatus } from "@/lib/types";
import type { AppArtifactStatus } from "@/lib/db/artifact-status";

export function getRegenerateBlockingError(
  status: AppRunStatus,
  artifactStatus: AppArtifactStatus,
  debateComplete: boolean,
): RegenerateRunArtifactsError | null {
  if (status === "idle") {
    return "run_in_progress";
  }

  if (status === "running") {
    if (!debateComplete) {
      return "run_in_progress";
    }
    if (artifactStatus === "generating" || artifactStatus === "ready") {
      return "run_in_progress";
    }
    return null;
  }

  if (artifactStatus === "generating") {
    return "run_in_progress";
  }

  return null;
}

export function isDebateCompleteFromMessages(
  messages: readonly { agentRole: string; content: string; }[],
): boolean {
  return isDebateComplete(
    messages.map((message) => ({
      agentRole: message.agentRole,
      content: message.content,
    })),
  );
}

/**
 * Artifact synthesis eligibility must honor controller-approved outcomes even
 * when the final reviewer message still contains [REJECT] (deterministic
 * finalization). Message-tag heuristics alone falsely block those runs.
 */
export function isDebateCompleteForArtifactSynthesis(params: {
  readonly messages: readonly { agentRole: string; content: string; }[];
  readonly debateOutcome: string | null | undefined;
}): boolean {
  if (
    params.debateOutcome === "approved" ||
    params.debateOutcome === "approved_with_accepted_risks" ||
    params.debateOutcome === "approved_forced_close"
  ) {
    return true;
  }
  return isDebateCompleteFromMessages(params.messages);
}
