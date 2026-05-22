"use client";

import { ArtifactPanelSkeleton } from "@/features/artifacts/artifact-panel-skeleton";
import { RegenerateArtifactsButton } from "@/features/artifacts/regenerate-artifacts-button";
import type { DebateProgress } from "@/features/artifacts/artifact-panel-phase";
import { DebateProgressStepper } from "@/features/artifacts/debate-progress-stepper";
import type { ArtifactsPanelStatus } from "@/features/artifacts/types";
import type { AgentRole } from "@/features/agents/types";

export interface ArtifactPanelPlaceholderProps {
  status: ArtifactsPanelStatus;
  regenerateRunId?: string;
  canRegenerateArtifacts?: boolean;
  debateProgress?: DebateProgress;
  debateMessages?: { role: AgentRole; isStreaming?: boolean }[];
  activeAgent?: AgentRole | null;
}

export function ArtifactPanelPlaceholder({
  status,
  regenerateRunId,
  canRegenerateArtifacts,
  debateProgress,
  debateMessages,
  activeAgent = null,
}: ArtifactPanelPlaceholderProps) {
  if (status === "generating") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <p className="shrink-0 px-4 pt-4 text-center text-body text-muted-foreground">
          Synthesizing requirements, architecture, implementation, and review…
        </p>
        <ArtifactPanelSkeleton />
      </div>
    );
  }

  const copy =
    status === "pending"
      ? debateProgress && debateProgress.completed > 0
        ? `${debateProgress.completed} of ${debateProgress.total} teammates have spoken. Artifacts generate when the discussion finishes.`
        : "The team is assembling. Structured artifacts will generate after the debate."
      : status === "unavailable"
        ? "Artifacts could not be generated for this run. Regenerate from the saved debate or start a new simulation."
        : "Start a simulation to generate requirements, architecture, implementation, and review.";

  const showStepper =
    status === "pending" && debateMessages != null && debateMessages.length > 0;

  return (
    <section className="flex h-full flex-col items-center justify-center gap-4 px-6 py-8 text-center">
      {showStepper ? (
        <DebateProgressStepper
          messages={debateMessages}
          activeAgent={activeAgent}
        />
      ) : status === "pending" ? (
        <span className="pulse-glow size-2.5 rounded-full bg-agent-architect" />
      ) : null}
      <p className="text-body text-muted-foreground">{copy}</p>
      {status === "unavailable" &&
      canRegenerateArtifacts &&
      regenerateRunId ? (
        <RegenerateArtifactsButton
          variant="placeholder"
          runId={regenerateRunId}
        />
      ) : null}
    </section>
  );
}
