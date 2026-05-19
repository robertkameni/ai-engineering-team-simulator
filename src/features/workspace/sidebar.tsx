"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Sparkles } from "lucide-react";

import { MOCK_RECENT_RUNS } from "@/features/simulation/mock-data";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

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
          {MOCK_RECENT_RUNS.map((run) => {
            const href =
              run.id === "run-demo" ? "/workspace" : `/runs/${run.id}`;
            const isActive =
              pathname === href ||
              (pathname === "/workspace" && run.id === "run-demo");

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
                <p className="truncate text-sm text-foreground">{run.title}</p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      run.status === "running"
                        ? "bg-agent-architect"
                        : run.status === "complete"
                          ? "bg-agent-backend"
                          : "bg-muted-foreground",
                    )}
                  />
                  {run.updatedAt}
                </p>
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
    </aside>
  );
}
