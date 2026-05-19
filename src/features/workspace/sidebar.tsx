"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, Sparkles } from "lucide-react";

import type { RunStatus } from "@/features/agents/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface RecentRunItem {
  id: string;
  title: string;
  status: RunStatus;
  updatedAt: string;
}

export function Sidebar() {
  const pathname = usePathname();
  const [runs, setRuns] = useState<RecentRunItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadRuns() {
      try {
        const response = await fetch("/api/runs");
        if (!response.ok) return;
        const data = (await response.json()) as { runs: RecentRunItem[] };
        if (!cancelled) {
          setRuns(data.runs);
        }
      } catch {
        // Sidebar stays empty on failure
      }
    }

    void loadRuns();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface-1">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex size-8 items-center justify-center rounded-md border border-border bg-surface-2">
          <Sparkles className="size-4 text-foreground" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">
            Team Sim
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            Engineering simulator
          </p>
        </div>
      </div>

      <div className="px-3 pb-2">
        <Button className="w-full justify-start gap-2" asChild>
          <Link href="/workspace">
            <Plus />
            New simulation
          </Link>
        </Button>
      </div>

      <Separator />

      <div className="px-4 py-3">
        <p className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
          Recent
        </p>
      </div>

      <ScrollArea className="flex-1 px-2">
        <nav className="flex flex-col gap-0.5 pb-4">
          {runs.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No runs yet. Start a simulation.
            </p>
          ) : (
            runs.map((run) => {
              const href = `/runs/${run.id}`;
              const isActive = pathname === href;

              return (
                <Link
                  key={run.id}
                  href={href}
                  className={cn(
                    "rounded-md px-3 py-2 transition-colors",
                    isActive
                      ? "border-l-2 border-l-foreground bg-accent pl-[10px]"
                      : "border-l-2 border-l-transparent hover:bg-accent/50",
                  )}
                >
                  <p className="truncate text-sm text-foreground">
                    {run.title}
                  </p>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        run.status === "running"
                          ? "bg-agent-architect"
                          : run.status === "complete"
                            ? "bg-agent-backend"
                            : run.status === "failed"
                              ? "bg-destructive"
                              : "bg-muted-foreground",
                      )}
                    />
                    {run.updatedAt}
                  </p>
                </Link>
              );
            })
          )}
        </nav>
      </ScrollArea>
    </aside>
  );
}
