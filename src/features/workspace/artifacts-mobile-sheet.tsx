"use client";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ArtifactPanel } from "@/features/artifacts/artifact-panel";
import type { ArtifactsPanelStatus, PartialRunArtifacts } from "@/features/artifacts/types";
import type { DebateProgress } from "@/features/artifacts/types";
import type { AgentRole, DebateExitOutcome } from "@/features/agents/types";
import type { TeamRosterPreview } from "@/lib/team-roster-preview";

interface ArtifactsMobileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artifacts?: PartialRunArtifacts | null;
  status?: ArtifactsPanelStatus;
  regenerateRunId?: string;
  canRegenerateArtifacts?: boolean;
  debateProgress?: DebateProgress;
  debateMessages?: { role: AgentRole; isStreaming?: boolean; agentTitle?: string }[];
  activeAgent?: AgentRole | null;
  teamRoster?: TeamRosterPreview | null;
  debateOutcome?: DebateExitOutcome | null;
  stackValidationFailed?: boolean;
  crossValidationFailed?: boolean;
}

export function ArtifactsMobileSheet({
  open,
  onOpenChange,
  artifacts = null,
  status = "idle",
  regenerateRunId,
  canRegenerateArtifacts = false,
  debateProgress,
  debateMessages,
  activeAgent = null,
  teamRoster = null,
  debateOutcome = null,
  stackValidationFailed = false,
  crossValidationFailed = false,
}: ArtifactsMobileSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showClose={false}
        className="glass-panel h-[min(88svh,720px)] gap-0 border-glass-border p-0"
      >
        <SheetTitle className="sr-only">Artifacts</SheetTitle>
        <SheetDescription className="sr-only">
          Structured outputs from the team debate
        </SheetDescription>
        <ArtifactPanel
          artifacts={artifacts}
          status={status}
          layout="sheet"
          regenerateRunId={regenerateRunId}
          canRegenerateArtifacts={canRegenerateArtifacts}
          debateProgress={debateProgress}
          debateMessages={debateMessages}
          activeAgent={activeAgent}
          teamRoster={teamRoster}
          debateOutcome={debateOutcome}
          stackValidationFailed={stackValidationFailed}
          crossValidationFailed={crossValidationFailed}
        />
      </SheetContent>
    </Sheet>
  );
}
