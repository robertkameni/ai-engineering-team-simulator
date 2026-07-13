"use client";

import type { ComponentProps } from "react";

import type { SidebarRunItemData } from "@/features/workspace/sidebar-types";
import {
  ArtifactsMobileSheet,
  SidebarMobileSheet,
} from "@/features/workspace/workspace-mobile-sheet-modules";

type ArtifactPanelProps = ComponentProps<typeof ArtifactsMobileSheet>;

interface WorkspaceMobileSheetPortalsProps {
  pathname: string;
  initialRecentRuns?: SidebarRunItemData[];
  showArtifactPanel: boolean;
  sidebarOpen: boolean;
  onSidebarOpenChange: (open: boolean) => void;
  artifactsOpen: boolean;
  onArtifactsOpenChange: (open: boolean) => void;
  sidebarSheetReady: boolean;
  artifactsSheetReady: boolean;
  artifactPanelProps: Omit<ArtifactPanelProps, "open" | "onOpenChange">;
}

export function WorkspaceMobileSheetPortals({
  pathname,
  initialRecentRuns,
  showArtifactPanel,
  sidebarOpen,
  onSidebarOpenChange,
  artifactsOpen,
  onArtifactsOpenChange,
  sidebarSheetReady,
  artifactsSheetReady,
  artifactPanelProps,
}: WorkspaceMobileSheetPortalsProps) {
  return (
    <>
      {sidebarSheetReady ? (
        <SidebarMobileSheet
          open={sidebarOpen}
          onOpenChange={onSidebarOpenChange}
          pathname={pathname}
          initialRecentRuns={initialRecentRuns}
        />
      ) : null}

      {showArtifactPanel && artifactsSheetReady ? (
        <ArtifactsMobileSheet
          open={artifactsOpen}
          onOpenChange={onArtifactsOpenChange}
          {...artifactPanelProps}
        />
      ) : null}
    </>
  );
}
