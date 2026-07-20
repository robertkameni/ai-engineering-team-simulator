"use client";

import { ArtifactPanelPlaceholder } from "@/features/artifacts/artifact-panel-placeholder";
import { ArtifactPanelHeader } from "@/features/artifacts/artifact-panel-header";
import { ArtifactPanelTabs } from "@/features/artifacts/artifact-panel-tabs";
import { ArtifactPanelWarnings } from "@/features/artifacts/artifact-panel-warnings";
import { buildArtifactPanelViewState } from "@/features/artifacts/artifact-panel-view-state";
import { useArtifactPanelState } from "@/features/artifacts/use-artifact-panel-state";
import { SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import {
  countRunArtifacts,
  shouldShowArtifactTabs,
} from "@/features/artifacts/artifact-panel-phase";
import type {
  ArtifactsPanelStatus,
  DebateProgress,
  PartialRunArtifacts,
} from "@/features/artifacts/types";
import type { AgentRole, DebateExitOutcome } from "@/features/agents/types";
import type { TeamRosterPreview } from "@/features/simulation/team-roster-preview";
import { cn } from "@/lib/utils";

interface ArtifactPanelProps {
  artifacts?: PartialRunArtifacts | null;
  status?: ArtifactsPanelStatus;
  layout?: "inline" | "sheet";
  regenerateRunId?: string;
  canRegenerateArtifacts?: boolean;
  debateProgress?: DebateProgress;
  debateMessages?: { role: AgentRole; isStreaming?: boolean; agentTitle?: string }[];
  activeAgent?: AgentRole | null;
  teamRoster?: TeamRosterPreview | null;
  debateOutcome?: DebateExitOutcome | null;
  postApproveTruncation?: boolean;
  stackValidationFailed?: boolean;
  crossValidationFailed?: boolean;
}

export function ArtifactPanel({
  artifacts = null,
  status = "idle",
  layout = "inline",
  regenerateRunId,
  canRegenerateArtifacts = false,
  debateProgress,
  debateMessages,
  activeAgent = null,
  teamRoster = null,
  debateOutcome = null,
  postApproveTruncation = false,
  stackValidationFailed = false,
  crossValidationFailed = false,
}: ArtifactPanelProps) {
  const {
    panelArtifacts,
    localStackValidationFailed,
    localCrossValidationFailed,
    handleBlueprintGenerated,
  } = useArtifactPanelState({
    artifacts,
    stackValidationFailed,
    crossValidationFailed,
  });

  const showTabs = shouldShowArtifactTabs(status, panelArtifacts);
  const isSheet = layout === "sheet";
  const showRegenerate = canRegenerateArtifacts && regenerateRunId != null;
  const viewState = buildArtifactPanelViewState({
    status,
    debateProgress,
    artifactCount: countRunArtifacts(panelArtifacts),
    debateOutcome,
    stackValidationFailed: localStackValidationFailed,
    crossValidationFailed: localCrossValidationFailed,
    postApproveTruncation,
    templateId: teamRoster?.templateId,
  });

  return (
    <aside
      className={cn(
        "@container/artifact-panel glass-panel flex min-h-0 shrink-0 flex-col overflow-hidden",
        isSheet
          ? "h-full w-full max-h-none border-0"
          : "hidden h-full max-h-none w-[min(100%,420px)] border-l border-glass-border min-[960px]:flex",
      )}
    >
      <ArtifactPanelHeader
        subtitle={viewState.subtitle}
        showRegenerate={showRegenerate}
        regenerateRunId={regenerateRunId ?? ""}
        status={status}
        trailingActions={
          isSheet ? (
            <SheetClose asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="glass-card size-8 border-glass-border"
                aria-label="Close artifacts"
              >
                <X className="size-4" />
              </Button>
            </SheetClose>
          ) : null
        }
      />

      <ArtifactPanelWarnings
        showDebateWarning={viewState.showDebateWarning}
        showSynthesisWarning={viewState.showSynthesisWarning}
        debateOutcome={debateOutcome}
        postApproveTruncation={postApproveTruncation}
        synthesisValidation={viewState.synthesisValidation}
      />

      {showTabs ? (
        <ArtifactPanelTabs
          artifactTabs={viewState.artifactTabs}
          panelArtifacts={panelArtifacts}
          regenerateRunId={regenerateRunId}
          status={status}
          onBlueprintGenerated={handleBlueprintGenerated}
        />
      ) : (
        <ArtifactPanelPlaceholder
          status={status}
          regenerateRunId={regenerateRunId}
          canRegenerateArtifacts={canRegenerateArtifacts}
          debateProgress={debateProgress}
          debateMessages={debateMessages}
          activeAgent={activeAgent}
          teamRoster={teamRoster}
        />
      )}
    </aside>
  );
}
