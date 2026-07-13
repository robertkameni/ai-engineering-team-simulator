"use client";

import { useMemo } from "react";

import { SavedRunMobileContext } from "@/features/workspace/saved-run-mobile-context";
import type { SidebarRunItemData } from "@/features/workspace/sidebar-types";
import { useWorkspaceMobileSheetState } from "@/features/workspace/use-workspace-mobile-sheet-state";
import { WorkspaceMobileSheetPortals } from "@/features/workspace/workspace-mobile-sheet-portals";
import type {
  ArtifactsPanelStatus,
  PartialRunArtifacts,
} from "@/features/artifacts/types";
import type { DebateExitOutcome } from "@/features/agents/types";

interface SavedRunMobileSheetsProps {
  pathname: string;
  initialRecentRuns: SidebarRunItemData[];
  showArtifactPanel: boolean;
  artifacts: PartialRunArtifacts | null;
  artifactsStatus: ArtifactsPanelStatus;
  regenerateRunId?: string;
  canRegenerateArtifacts: boolean;
  debateOutcome?: DebateExitOutcome | null;
  children: React.ReactNode;
}

export function SavedRunMobileSheets({
  pathname,
  initialRecentRuns,
  showArtifactPanel,
  artifacts,
  artifactsStatus,
  regenerateRunId,
  canRegenerateArtifacts,
  debateOutcome = null,
  children,
}: SavedRunMobileSheetsProps) {
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

  const mobileContext = useMemo(
    () => ({
      openSidebar,
      openArtifacts,
    }),
    [openSidebar, openArtifacts],
  );

  const artifactPanelProps = {
    artifacts,
    status: artifactsStatus,
    regenerateRunId,
    canRegenerateArtifacts,
    debateOutcome,
  };

  return (
    <SavedRunMobileContext.Provider value={mobileContext}>
      {children}

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
    </SavedRunMobileContext.Provider>
  );
}
