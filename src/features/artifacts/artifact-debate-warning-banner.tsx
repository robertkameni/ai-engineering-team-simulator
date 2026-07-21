import { AlertTriangle } from "lucide-react";

import {
  debateOutcomeWarningMessage,
  isSoftApprovedDebateOutcome,
  isUnapprovedDebateOutcome,
} from "@/features/artifacts/artifact-panel-phase";
import type { DebateExitOutcome } from "@/features/agents/types";

interface ArtifactDebateWarningBannerProps {
  debateOutcome: DebateExitOutcome | null | undefined;
  postApproveTruncation?: boolean;
}

export function ArtifactDebateWarningBanner({
  debateOutcome,
  postApproveTruncation = false,
}: ArtifactDebateWarningBannerProps) {
  if (
    postApproveTruncation ||
    debateOutcome === "approved_forced_close" ||
    debateOutcome === "approved_with_accepted_risks"
  ) {
    const title =
      debateOutcome === "approved_with_accepted_risks"
        ? "Approved with accepted risks"
        : debateOutcome === "approved_forced_close" || postApproveTruncation
          ? "Approved (forced close)"
          : "Approved with warnings";
    const message =
      debateOutcome && isSoftApprovedDebateOutcome(debateOutcome)
        ? debateOutcomeWarningMessage(debateOutcome)
        : postApproveTruncation
          ? "Critical turns remained truncated after recovery. Deliverables may have incomplete sections."
          : debateOutcomeWarningMessage(debateOutcome ?? "approved_forced_close");

    return (
      <div
        role="status"
        className="mx-4 mb-3 flex shrink-0 items-start gap-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{message}</p>
        </div>
      </div>
    );
  }

  if (!isUnapprovedDebateOutcome(debateOutcome)) {
    return null;
  }

  const message = debateOutcomeWarningMessage(debateOutcome);

  return (
    <div
      role="status"
      className="mx-4 mb-3 flex shrink-0 items-start gap-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          Debate ended without approval
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
