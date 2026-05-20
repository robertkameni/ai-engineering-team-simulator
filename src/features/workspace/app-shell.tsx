"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ArtifactPanel } from "@/features/artifacts/artifact-panel";
import type {
  ArtifactsPanelStatus,
  RunArtifacts,
} from "@/features/artifacts/types";
import { Sidebar } from "@/features/workspace/sidebar";
import { SidebarContent } from "@/features/workspace/sidebar-content";
import { WorkspaceMobileContext } from "@/features/workspace/workspace-mobile-context";

interface AppShellProps {
  children: React.ReactNode;
  artifacts?: RunArtifacts | null;
  artifactsStatus?: ArtifactsPanelStatus;
}

export function AppShell({
  children,
  artifacts = null,
  artifactsStatus = "idle",
}: AppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [artifactsOpen, setArtifactsOpen] = useState(false);

  const showArtifactsAction =
    artifactsStatus !== "idle" || artifacts != null;

  const mobileContext = useMemo(
    () => ({
      openSidebar: () => setSidebarOpen(true),
      openArtifacts: () => setArtifactsOpen(true),
      showArtifactsAction,
    }),
    [showArtifactsAction],
  );

  return (
    <WorkspaceMobileContext.Provider value={mobileContext}>
      <div className="@container/app-shell ambient-mesh relative flex h-svh flex-col overflow-hidden">
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden @[960px]/app-shell:flex-row">
          <Sidebar />
          <div className="@container/workspace-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
          <div className="hidden min-h-0 @[960px]/app-shell:flex">
            <ArtifactPanel
              artifacts={artifacts}
              status={artifactsStatus}
              layout="inline"
            />
          </div>
        </div>
      </div>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent
          side="left"
          className="glass-panel w-[min(100%,288px)] border-glass-border p-0 sm:max-w-xs"
        >
          <SheetTitle className="sr-only">Recent simulations</SheetTitle>
          <SidebarContent
            pathname={pathname}
            onNavigate={() => setSidebarOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={artifactsOpen} onOpenChange={setArtifactsOpen}>
        <SheetContent
          side="bottom"
          className="glass-panel h-[min(88svh,720px)] gap-0 border-glass-border p-0"
        >
          <SheetTitle className="sr-only">Artifacts</SheetTitle>
          <ArtifactPanel
            artifacts={artifacts}
            status={artifactsStatus}
            layout="sheet"
          />
        </SheetContent>
      </Sheet>
    </WorkspaceMobileContext.Provider>
  );
}
