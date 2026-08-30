import { ArtifactSections } from "@/features/artifacts/artifact-sections";
import { BlueprintTabContent } from "@/features/artifacts/blueprint-tab-content";
import { ArtifactPanelPlaceholder } from "@/features/artifacts/artifact-panel-placeholder";
import { ArtifactPanelHeader } from "@/features/artifacts/artifact-panel-header";
import { ArtifactPanelWarnings } from "@/features/artifacts/artifact-panel-warnings";
import { buildArtifactPanelViewState } from "@/features/artifacts/artifact-panel-view-state";
import {
    countRunArtifacts,
    debateProgressFromMessages,
    shouldShowArtifactTabs,
} from "@/features/artifacts/artifact-panel-phase";
import { ArtifactPanelSkeleton } from "@/features/artifacts/artifact-panel-skeleton";
import { ARTIFACT_TAB_LIST_CLASS, ARTIFACT_TAB_TRIGGER_STATIC } from "@/features/artifacts/artifact-tab-styles";
import type {
    ArtifactsPanelStatus,
    PartialRunArtifacts,
} from "@/features/artifacts/types";
import type { AgentRole, DebateExitOutcome } from "@/lib/types";
import type { TeamRosterPreview } from "@/lib/team-roster-preview";
import { cn } from "@/lib/utils";

interface ArtifactPanelStaticProps {
  artifacts?: PartialRunArtifacts | null;
  status?: ArtifactsPanelStatus;
  regenerateRunId?: string;
  canRegenerateArtifacts?: boolean;
  debateMessages?: { role: AgentRole; isStreaming?: boolean; agentTitle?: string }[];
  teamRoster?: TeamRosterPreview | null;
  debateOutcome?: DebateExitOutcome | null;
  postApproveTruncation?: boolean;
  stackValidationFailed?: boolean;
  crossValidationFailed?: boolean;
}

/** Server artifact panel — CSS tabs + native scroll (no Radix). */
export function ArtifactPanelStatic({
  artifacts = null,
  status = "idle",
  regenerateRunId,
  canRegenerateArtifacts = false,
  debateMessages = [],
  teamRoster = null,
  debateOutcome = null,
  postApproveTruncation = false,
  stackValidationFailed = false,
  crossValidationFailed = false,
}: ArtifactPanelStaticProps) {
  const showTabs = shouldShowArtifactTabs(status, artifacts);
  const showRegenerate = canRegenerateArtifacts && regenerateRunId != null;
  const debateProgress = debateProgressFromMessages(debateMessages, null);
  const viewState = buildArtifactPanelViewState({
    status,
    debateProgress,
    artifactCount: countRunArtifacts(artifacts),
    debateOutcome,
    stackValidationFailed,
    crossValidationFailed,
    postApproveTruncation,
    templateId: teamRoster?.templateId,
  });

  return (
    <aside
      className={cn(
        "@container/artifact-panel glass-panel hidden min-h-0 shrink-0 flex-col overflow-x-hidden",
        "h-full max-h-none w-[min(100%,420px)] border-l border-glass-border min-[960px]:flex",
      )}
    >
      <ArtifactPanelHeader
        subtitle={viewState.subtitle}
        showRegenerate={showRegenerate}
        regenerateRunId={regenerateRunId ?? ""}
        status={status}
      />

      <ArtifactPanelWarnings
        showDebateWarning={viewState.showDebateWarning}
        showSynthesisWarning={viewState.showSynthesisWarning}
        debateOutcome={debateOutcome}
        postApproveTruncation={postApproveTruncation}
        synthesisValidation={viewState.synthesisValidation}
      />

      {showTabs ? (
        <div className="artifact-static-tabs flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {viewState.artifactTabs.map((tab, index) => (
            <input
              key={tab.value}
              type="radio"
              name="artifact-tab"
              id={`artifact-tab-${tab.value}`}
              value={tab.value}
              defaultChecked={index === 0}
              tabIndex={-1}
              suppressHydrationWarning
            />
          ))}

          <div
            className={cn(
              "artifact-static-labels mb-2 min-w-0 shrink-0 px-3 pt-3 @max-sm/artifact-panel:pb-3",
              ARTIFACT_TAB_LIST_CLASS,
            )}
            role="tablist"
            aria-label="Artifact categories"
          >
            {viewState.artifactTabs.map((tab) => (
              <label
                key={tab.value}
                htmlFor={`artifact-tab-${tab.value}`}
                title={tab.label}
                className={cn(ARTIFACT_TAB_TRIGGER_STATIC, "cursor-pointer")}
              >
                {tab.label}
              </label>
            ))}
          </div>

          <div className="artifact-static-panels flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {viewState.artifactTabs.map((tab) => (
              <div
                key={tab.value}
                role="tabpanel"
                data-artifact-panel={tab.value}
                className="artifact-static-panel artifact-tab-content mt-0 min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 h-[calc(100svh-7.5rem)]"
              >
                {artifacts?.[tab.value] ? (
                  <ArtifactSections sections={artifacts[tab.value]!} />
                ) : tab.value === "blueprint" &&
                  regenerateRunId &&
                  status === "ready" ? (
                  <BlueprintTabContent
                    runId={regenerateRunId}
                    sections={artifacts?.blueprint}
                  />
                ) : (
                  <ArtifactPanelSkeleton />
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <ArtifactPanelPlaceholder
          status={status}
          regenerateRunId={regenerateRunId}
          canRegenerateArtifacts={canRegenerateArtifacts}
          debateProgress={debateProgress}
          debateMessages={debateMessages}
          teamRoster={teamRoster}
        />
      )}
    </aside>
  );
}
