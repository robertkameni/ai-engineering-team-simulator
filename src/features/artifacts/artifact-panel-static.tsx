import { ArtifactSections } from "@/features/artifacts/artifact-sections";
import { ArtifactPanelPlaceholder } from "@/features/artifacts/artifact-panel-placeholder";
import { RegenerateArtifactsButton } from "@/features/artifacts/regenerate-artifacts-button";
import {
  artifactPanelSubtitle,
  countRunArtifacts,
  debateProgressFromMessages,
  shouldShowArtifactTabs,
} from "@/features/artifacts/artifact-panel-phase";
import { ArtifactPanelSkeleton } from "@/features/artifacts/artifact-panel-skeleton";
import { ARTIFACT_TAB_LIST_CLASS, ARTIFACT_TAB_TRIGGER_STATIC, getArtifactTabConfig } from "@/features/artifacts/artifact-tab-styles";
import type {
  ArtifactsPanelStatus,
  PartialRunArtifacts,
} from "@/features/artifacts/types";
import type { AgentRole } from "@/features/agents/types";
import type { TeamRosterPreview } from "@/features/simulation/team-roster-preview";
import { cn } from "@/lib/utils";

interface ArtifactPanelStaticProps {
  artifacts?: PartialRunArtifacts | null;
  status?: ArtifactsPanelStatus;
  regenerateRunId?: string;
  canRegenerateArtifacts?: boolean;
  debateMessages?: { role: AgentRole; isStreaming?: boolean; agentTitle?: string }[];
  teamRoster?: TeamRosterPreview | null;
}

/** Server artifact panel — CSS tabs + native scroll (no Radix). */
export function ArtifactPanelStatic({
  artifacts = null,
  status = "idle",
  regenerateRunId,
  canRegenerateArtifacts = false,
  debateMessages = [],
  teamRoster = null,
}: ArtifactPanelStaticProps) {
  const showTabs = shouldShowArtifactTabs(status, artifacts);
  const showRegenerate = canRegenerateArtifacts && regenerateRunId != null;
  const debateProgress = debateProgressFromMessages(debateMessages, null);
  const artifactCount = countRunArtifacts(artifacts);
  const subtitle = artifactPanelSubtitle(status, debateProgress, artifactCount);
  const artifactTabs = getArtifactTabConfig(teamRoster?.templateId ?? "software");

  return (
    <aside
      className={cn(
        "@container/artifact-panel glass-panel hidden min-h-0 shrink-0 flex-col overflow-x-hidden",
        "h-full max-h-none w-[min(100%,420px)] border-l border-glass-border min-[960px]:flex",
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-glass-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-title font-semibold tracking-tight">Artifacts</h2>
          <p className="mt-0.5 text-caption text-muted-foreground">{subtitle}</p>
        </div>
        {showRegenerate ? (
          <RegenerateArtifactsButton
            runId={regenerateRunId}
            disabled={status === "generating" || status === "pending"}
          />
        ) : null}
      </header>

      {showTabs ? (
        <div className="artifact-static-tabs flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {artifactTabs.map((tab, index) => (
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
              "artifact-static-labels min-w-0 shrink-0 px-4 pt-3 @max-sm/artifact-panel:pb-3",
              ARTIFACT_TAB_LIST_CLASS,
            )}
            role="tablist"
            aria-label="Artifact categories"
          >
            {artifactTabs.map((tab) => (
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
            {artifactTabs.map((tab) => (
              <div
                key={tab.value}
                role="tabpanel"
                data-artifact-panel={tab.value}
                className="artifact-static-panel artifact-tab-content mt-0 min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 h-[calc(100svh-7.5rem)]"
              >
                {artifacts?.[tab.value] ? (
                  <ArtifactSections sections={artifacts[tab.value]!} />
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
