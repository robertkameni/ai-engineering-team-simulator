"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarBrandLink } from "@/features/workspace/sidebar-brand-link";
import { SidebarSimulationAction } from "@/features/workspace/sidebar-simulation-action";
import { SidebarRecentRuns } from "@/features/workspace/sidebar-recent-runs";
import type { SidebarRunItemData } from "@/features/workspace/sidebar-types";

interface SidebarContentProps {
  pathname: string;
  onNavigate?: () => void;
  initialRecentRuns?: SidebarRunItemData[];
}

export function SidebarContent({
  pathname,
  onNavigate,
  initialRecentRuns,
}: SidebarContentProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="px-4 py-4">
        <SidebarBrandLink onNavigate={onNavigate} />
      </header>

      <section className="px-3 pb-2">
        <SidebarSimulationAction onNavigate={onNavigate} />
      </section>

      <div className="mx-3 h-px bg-glass-border" />

      <section className="px-4 py-3">
        <p className="text-caption font-medium tracking-widest text-muted-foreground uppercase">
          Recent
        </p>
      </section>

      <ScrollArea className="min-h-0 flex-1 px-2">
        <nav className="flex flex-col gap-0.5 pb-4">
          <SidebarRecentRuns
            key={pathname}
            pathname={pathname}
            onNavigate={onNavigate}
            initialRuns={initialRecentRuns}
          />
        </nav>
      </ScrollArea>
    </div>
  );
}
