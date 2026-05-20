"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";

import { SavedRunMobileContext } from "@/features/workspace/saved-run-mobile-context";
import type { SidebarRunItemData } from "@/features/workspace/sidebar-types";
import type {
  ArtifactsPanelStatus,
  RunArtifacts,
} from "@/features/artifacts/types";

const SidebarMobileSheet = dynamic(
  () =>
    import("@/features/workspace/sidebar-mobile-sheet").then(
      (module) => module.SidebarMobileSheet,
    ),
  { ssr: false },
);

const ArtifactsMobileSheet = dynamic(
  () =>
    import("@/features/workspace/artifacts-mobile-sheet").then(
      (module) => module.ArtifactsMobileSheet,
    ),
  { ssr: false },
);

interface SavedRunMobileSheetsProps {
  pathname: string;
  initialRecentRuns: SidebarRunItemData[];
  showArtifactPanel: boolean;
  artifacts: RunArtifacts | null;
  artifactsStatus: ArtifactsPanelStatus;
  regenerateRunId?: string;
  canRegenerateArtifacts: boolean;
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
  children,
}: SavedRunMobileSheetsProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [sidebarSheetReady, setSidebarSheetReady] = useState(false);
  const [artifactsSheetReady, setArtifactsSheetReady] = useState(false);

  const mobileContext = useMemo(
    () => ({
      openSidebar: () => {
        setSidebarSheetReady(true);
        setSidebarOpen(true);
      },
      openArtifacts: () => {
        setArtifactsSheetReady(true);
        setArtifactsOpen(true);
      },
    }),
    [],
  );

  const artifactPanelProps = {
    artifacts,
    status: artifactsStatus,
    regenerateRunId,
    canRegenerateArtifacts,
  };

  return (
    <SavedRunMobileContext.Provider value={mobileContext}>
      {children}

      {sidebarSheetReady ? (
        <SidebarMobileSheet
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          pathname={pathname}
          initialRecentRuns={initialRecentRuns}
        />
      ) : null}

      {showArtifactPanel && artifactsSheetReady ? (
        <ArtifactsMobileSheet
          open={artifactsOpen}
          onOpenChange={setArtifactsOpen}
          {...artifactPanelProps}
        />
      ) : null}
    </SavedRunMobileContext.Provider>
  );
}
