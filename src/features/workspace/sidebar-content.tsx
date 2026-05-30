"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
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
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-lg transition-colors hover:bg-white/4"
        >
          <span className="glass-card flex size-9 shrink-0 items-center justify-center rounded-xl">
            <Sparkles className="size-4 text-agent-architect" />
          </span>
          <span className="min-w-0">
            <p className="truncate text-title font-semibold tracking-tight">
              Team Sim
            </p>
            <p className="truncate text-caption text-muted-foreground">
              Engineering simulator
            </p>
          </span>
        </Link>
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
