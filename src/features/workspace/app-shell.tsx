"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ArtifactPanel } from "@/features/artifacts/artifact-panel";
import type {ArtifactsPanelStatus,RunArtifacts} from "@/features/artifacts/types";
import { Sidebar } from "@/features/workspace/sidebar";
import { SidebarContent } from "@/features/workspace/sidebar-content";
import { WorkspaceMobileContext } from "@/features/workspace/workspace-mobile-context";

interface AppShellProps {
  children: React.ReactNode;
  artifacts?: RunArtifacts | null;
  artifactsStatus?: ArtifactsPanelStatus;
  onRegenerateArtifacts?: () => void | Promise<void>;
  canRegenerateArtifacts?: boolean;
  isRegeneratingArtifacts?: boolean;
}

export function AppShell({
  children,
  artifacts = null,
  artifactsStatus = "idle",
  onRegenerateArtifacts,
  canRegenerateArtifacts = false,
  isRegeneratingArtifacts = false,
}: AppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [artifactsOpen, setArtifactsOpen] = useState(false);

  const showArtifactPanel =
    artifactsStatus !== "idle" ||
    artifacts != null ||
    canRegenerateArtifacts;

  const showArtifactsAction = showArtifactPanel;

  const mobileContext = useMemo(
    () => ({
      openSidebar: () => setSidebarOpen(true),
      openArtifacts: () => setArtifactsOpen(true),
      showArtifactsAction,
    }),
    [showArtifactsAction],
  );

  const artifactPanelProps = {
    artifacts,
    status: artifactsStatus,
    onRegenerateArtifacts,
    canRegenerateArtifacts,
    isRegeneratingArtifacts,
  };

  return (
    <WorkspaceMobileContext.Provider value={mobileContext}>
      <div className="@container/app-shell ambient-mesh relative flex h-svh flex-col overflow-hidden">
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden @[960px]/app-shell:flex-row">
          <Sidebar />
          <div className="@container/workspace-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
          {showArtifactPanel ? (
            <ArtifactPanel {...artifactPanelProps} layout="inline" />
          ) : null}
        </div>
      </div>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent
          side="left"
          className="glass-panel w-[min(100%,288px)] border-glass-border p-0 sm:max-w-xs"
        >
          <SheetTitle className="sr-only">Recent simulations</SheetTitle>
          <SheetDescription className="sr-only">
            Browse recent runs and start a new simulation
          </SheetDescription>
          <SidebarContent
            pathname={pathname}
            onNavigate={() => setSidebarOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {showArtifactPanel ? (
        <Sheet open={artifactsOpen} onOpenChange={setArtifactsOpen}>
          <SheetContent
            side="bottom"
            showClose={false}
            className="glass-panel h-[min(88svh,720px)] gap-0 border-glass-border p-0"
          >
            <SheetTitle className="sr-only">Artifacts</SheetTitle>
            <SheetDescription className="sr-only">
              Structured outputs from the team debate
            </SheetDescription>
            <ArtifactPanel {...artifactPanelProps} layout="sheet" />
          </SheetContent>
        </Sheet>
      ) : null}
    </WorkspaceMobileContext.Provider>
  );
}
