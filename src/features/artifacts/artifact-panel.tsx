"use client";

import { useCallback, useEffect, useState } from "react";

import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import { ArtifactSections } from "@/features/artifacts/artifact-sections";
import { ArtifactPanelPlaceholder } from "@/features/artifacts/artifact-panel-placeholder";
import { ArtifactPanelSkeleton } from "@/features/artifacts/artifact-panel-skeleton";
import { GenerateBlueprintButton } from "@/features/artifacts/generate-blueprint-button";
import { RegenerateArtifactsButton } from "@/features/artifacts/regenerate-artifacts-button";
import { SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import {
    ARTIFACT_TAB_LIST_CLASS,
    ARTIFACT_TAB_TRIGGER_BASE,
    getArtifactTabConfig,
} from "@/features/artifacts/artifact-tab-styles";
import { ArtifactDebateWarningBanner } from "@/features/artifacts/artifact-debate-warning-banner";
import { ArtifactSynthesisWarningBanner } from "@/features/artifacts/artifact-synthesis-warning-banner";
import {
    artifactPanelSubtitle,
    countRunArtifacts,
    isUnapprovedDebateOutcome,
    shouldShowArtifactTabs,
} from "@/features/artifacts/artifact-panel-phase";
import {
  hasSynthesisValidationWarnings,
  parseSynthesisValidationFlags,
} from "@/features/artifacts/synthesis-validation";
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
  stackValidationFailed = false,
  crossValidationFailed = false,
}: ArtifactPanelProps) {
  const [panelArtifacts, setPanelArtifacts] = useState(artifacts);
  const [localStackValidationFailed, setLocalStackValidationFailed] = useState(
    stackValidationFailed,
  );
  const [localCrossValidationFailed, setLocalCrossValidationFailed] = useState(
    crossValidationFailed,
  );

  useEffect(() => {
    setPanelArtifacts(artifacts);
  }, [artifacts]);

  useEffect(() => {
    setLocalStackValidationFailed(stackValidationFailed);
    setLocalCrossValidationFailed(crossValidationFailed);
  }, [stackValidationFailed, crossValidationFailed]);

  const handleBlueprintGenerated = useCallback(
    (
      generated: PartialRunArtifacts,
      validationFlags?: {
        stackValidationFailed: boolean;
        crossValidationFailed: boolean;
      },
    ) => {
      setPanelArtifacts((current) => ({ ...current, ...generated }));
      if (validationFlags) {
        setLocalStackValidationFailed((current) =>
          current || validationFlags.stackValidationFailed,
        );
        setLocalCrossValidationFailed((current) =>
          current || validationFlags.crossValidationFailed,
        );
      }
    },
    [],
  );

  const showTabs = shouldShowArtifactTabs(status, panelArtifacts);
  const isSheet = layout === "sheet";
  const showRegenerate = canRegenerateArtifacts && regenerateRunId != null;
  const artifactCount = countRunArtifacts(panelArtifacts);
  const synthesisValidation = parseSynthesisValidationFlags(
    localStackValidationFailed,
    localCrossValidationFailed,
  );
  const subtitle = artifactPanelSubtitle(
    status,
    debateProgress,
    artifactCount,
    debateOutcome,
    synthesisValidation,
  );
  const showDebateWarning =
    isUnapprovedDebateOutcome(debateOutcome) &&
    (status === "ready" || status === "generating");
  const showSynthesisWarning =
    hasSynthesisValidationWarnings(synthesisValidation) &&
    (status === "ready" || status === "generating");
  const artifactTabs = getArtifactTabConfig(teamRoster?.templateId ?? "software");

  return (
    <aside
      className={cn(
        "@container/artifact-panel glass-panel flex min-h-0 shrink-0 flex-col overflow-hidden",
        isSheet
          ? "h-full w-full max-h-none border-0"
          : "hidden h-full max-h-none w-[min(100%,420px)] border-l border-glass-border min-[960px]:flex",
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-glass-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-title font-semibold tracking-tight">Artifacts</h2>
          <p className="mt-0.5 text-caption text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showRegenerate ? (
            <RegenerateArtifactsButton
              runId={regenerateRunId}
              disabled={status === "generating" || status === "pending"}
            />
          ) : null}
          {isSheet ? (
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
          ) : null}
        </div>
      </header>

      {showDebateWarning ? (
        <ArtifactDebateWarningBanner debateOutcome={debateOutcome} />
      ) : null}

      {showSynthesisWarning ? (
        <ArtifactSynthesisWarningBanner synthesisValidation={synthesisValidation} />
      ) : null}

      {showTabs ? (
        <Tabs
          defaultValue="requirements"
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden"
        >
          <div className="relative z-10 min-w-0 shrink-0 bg-glass-bg px-4 pt-3 @max-sm/artifact-panel:pb-3">
            <TabsList className={cn(ARTIFACT_TAB_LIST_CLASS, "h-auto w-full")}>
              {artifactTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  title={tab.label}
                  className={cn(ARTIFACT_TAB_TRIGGER_BASE, tab.triggerClass)}
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {artifactTabs.map((tab) => (
              <TabsContent
                key={tab.value}
                value={tab.value}
                className="artifact-tab-content m-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col"
              >
                {panelArtifacts?.[tab.value] ? (
                  <ArtifactSections sections={panelArtifacts[tab.value]!} />
                ) : tab.value === "blueprint" &&
                  regenerateRunId &&
                  status === "ready" ? (
                  <GenerateBlueprintButton
                    runId={regenerateRunId}
                    onGenerated={handleBlueprintGenerated}
                  />
                ) : (
                  <ArtifactPanelSkeleton />
                )}
              </TabsContent>
            ))}
          </div>
        </Tabs>
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
