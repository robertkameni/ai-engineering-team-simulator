"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import type { ArtifactsPanelStatus, RunArtifacts } from "@/features/artifacts/types";
import { Sidebar } from "@/features/workspace/sidebar";
import type { SidebarRunItemData } from "@/features/workspace/sidebar-types";
import { WorkspaceMobileContext } from "@/features/workspace/workspace-mobile-context";
import { useMinWidth } from "@/lib/use-media-query";

const ArtifactPanel = dynamic(
  () =>
    import("@/features/artifacts/artifact-panel").then(
      (module) => module.ArtifactPanel,
    ),
);

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

interface AppShellProps {
  children: React.ReactNode;
  artifacts?: RunArtifacts | null;
  artifactsStatus?: ArtifactsPanelStatus;
  regenerateRunId?: string;
  canRegenerateArtifacts?: boolean;
  initialRecentRuns?: SidebarRunItemData[];
}

export function AppShell({
  children,
  artifacts = null,
  artifactsStatus = "idle",
  regenerateRunId,
  canRegenerateArtifacts = false,
  initialRecentRuns,
}: AppShellProps) {
  const pathname = usePathname();
  const isWide = useMinWidth(960);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [sidebarSheetReady, setSidebarSheetReady] = useState(false);
  const [artifactsSheetReady, setArtifactsSheetReady] = useState(false);

  const showArtifactPanel =
    artifactsStatus !== "idle" ||
    artifacts != null ||
    canRegenerateArtifacts;

  const showArtifactsAction = showArtifactPanel;

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
      showArtifactsAction,
    }),
    [showArtifactsAction],
  );

  const artifactPanelProps = {
    artifacts,
    status: artifactsStatus,
    regenerateRunId,
    canRegenerateArtifacts,
  };

  return (
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
      </div>

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
    </WorkspaceMobileContext.Provider>
  );
}
