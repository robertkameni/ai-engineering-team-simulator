"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { usePathname } from "next/navigation";

import { ArtifactPanelSkeleton } from "@/features/artifacts/artifact-panel-skeleton";
import type { ArtifactsPanelStatus, PartialRunArtifacts } from "@/features/artifacts/types";
import type { DebateProgress } from "@/features/artifacts/types";
import type { AgentRole, DebateExitOutcome } from "@/features/agents/types";
import type { TeamRosterPreview } from "@/features/simulation/team-roster-preview";
import { Sidebar } from "@/features/workspace/sidebar";
import type { SidebarRunItemData } from "@/features/workspace/sidebar-types";
import { useWorkspaceMobileSheetState } from "@/features/workspace/use-workspace-mobile-sheet-state";
import { WorkspaceMobileContext } from "@/features/workspace/workspace-mobile-context";
import { WorkspaceMobileSheetPortals } from "@/features/workspace/workspace-mobile-sheet-portals";
import { WorkspaceRunProvider } from "@/features/workspace/workspace-run-context";
import { SiteFooter } from "@/components/site-footer";
import { useMinWidth } from "@/hooks/use-media-query";

/** Arch-review F6: defer live ArtifactPanel chunk until showArtifactPanel. */
const ArtifactPanel = dynamic(
  () =>
    import("@/features/artifacts/artifact-panel").then(
      (module) => module.ArtifactPanel,
    ),
  {
    ssr: false,
    loading: () => (
      <aside className="@container/artifact-panel glass-panel hidden h-full w-[min(100%,420px)] shrink-0 flex-col overflow-hidden border-l border-glass-border min-[960px]:flex">
        <ArtifactPanelSkeleton />
      </aside>
    ),
  },
);

interface AppShellProps {
  children: React.ReactNode;
  artifacts?: PartialRunArtifacts | null;
  artifactsStatus?: ArtifactsPanelStatus;
  regenerateRunId?: string;
  canRegenerateArtifacts?: boolean;
  initialRecentRuns?: SidebarRunItemData[];
  debateProgress?: DebateProgress;
  debateMessages?: { role: AgentRole; isStreaming?: boolean; agentTitle?: string }[];
  activeAgent?: AgentRole | null;
  teamRoster?: TeamRosterPreview | null;
  debateOutcome?: DebateExitOutcome | null;
  stackValidationFailed?: boolean;
  crossValidationFailed?: boolean;
}

export function AppShell({
  children,
  artifacts = null,
  artifactsStatus = "idle",
  regenerateRunId,
  canRegenerateArtifacts = false,
  initialRecentRuns,
  debateProgress,
  debateMessages,
  activeAgent = null,
  teamRoster = null,
  debateOutcome = null,
  stackValidationFailed = false,
  crossValidationFailed = false,
}: AppShellProps) {
  const pathname = usePathname();
  const isWide = useMinWidth(960);
  const {
    sidebarOpen,
    setSidebarOpen,
    artifactsOpen,
    setArtifactsOpen,
    sidebarSheetReady,
    artifactsSheetReady,
    openSidebar,
    openArtifacts,
  } = useWorkspaceMobileSheetState();

  const showArtifactPanel =
    artifactsStatus !== "idle" ||
    artifacts != null ||
    canRegenerateArtifacts;

  const showArtifactsAction = showArtifactPanel;

  const mobileContext = useMemo(
    () => ({
      openSidebar,
      openArtifacts,
      showArtifactsAction,
    }),
    [openSidebar, openArtifacts, showArtifactsAction],
  );

  const artifactPanelProps = {
    artifacts,
    status: artifactsStatus,
    regenerateRunId,
    canRegenerateArtifacts,
    debateProgress,
    debateMessages,
    activeAgent,
    teamRoster,
    debateOutcome,
    stackValidationFailed,
    crossValidationFailed,
  };

  return (
    <WorkspaceRunProvider>
      <WorkspaceMobileContext.Provider value={mobileContext}>
      <div className="@container/app-shell ambient-mesh relative flex h-svh flex-col overflow-hidden">
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden min-[720px]:flex-row">
          <Sidebar initialRecentRuns={initialRecentRuns} />
          <div className="@container/workspace-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
          {showArtifactPanel && isWide ? (
            <ArtifactPanel {...artifactPanelProps} layout="inline" />
          ) : null}
        </div>
        <SiteFooter />
      </div>

      <WorkspaceMobileSheetPortals
        pathname={pathname}
        initialRecentRuns={initialRecentRuns}
        showArtifactPanel={showArtifactPanel}
        sidebarOpen={sidebarOpen}
        onSidebarOpenChange={setSidebarOpen}
        artifactsOpen={artifactsOpen}
        onArtifactsOpenChange={setArtifactsOpen}
        sidebarSheetReady={sidebarSheetReady}
        artifactsSheetReady={artifactsSheetReady}
        artifactPanelProps={artifactPanelProps}
      />
      </WorkspaceMobileContext.Provider>
    </WorkspaceRunProvider>
  );
}
