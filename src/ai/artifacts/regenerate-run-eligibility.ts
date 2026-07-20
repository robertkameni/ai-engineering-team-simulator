import "server-only";

import { isDebateComplete } from "@/ai/orchestration/reviewer-decision";
import type { RegenerateRunArtifactsError } from "@/ai/artifacts/regenerate-run-artifacts.types";
import { toAppArtifactStatus } from "@/lib/db/artifact-status";
import { toAppRunStatus } from "@/lib/db/run-status";

type AppRunStatus = ReturnType<typeof toAppRunStatus>;
type AppArtifactStatus = ReturnType<typeof toAppArtifactStatus>;

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
  messages: readonly { agentRole: string; content: string }[],
): boolean {
  return isDebateComplete(
    messages.map((message) => ({
      agentRole: message.agentRole,
      content: message.content,
    })),
  );
}
