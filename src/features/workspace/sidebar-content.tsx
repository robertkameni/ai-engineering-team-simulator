"use client";

import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
        <Button
          className="w-full justify-start gap-2 transition-transform duration-200 hover:scale-[1.01] active:scale-[0.98]"
          asChild
        >
          <Link href="/workspace" onClick={onNavigate}>
            <Plus />
            New simulation
          </Link>
        </Button>
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
