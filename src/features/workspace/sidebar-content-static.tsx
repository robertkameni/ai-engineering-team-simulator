import Link from "next/link";
import { Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteRunAction } from "@/features/workspace/delete-run-action";
import { SidebarSimulationAction } from "@/features/workspace/sidebar-simulation-action";
import type { SidebarRunItemData } from "@/features/workspace/sidebar-types";
import { cn } from "@/lib/utils";

interface SidebarContentStaticProps {
  pathname: string;
  runs: SidebarRunItemData[];
  rerunPrompt?: string | null;
}

export function SidebarContentStatic({
  pathname,
  runs,
  rerunPrompt,
}: SidebarContentStaticProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="px-4 py-4">
        <Link
          href="/"
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
        <SidebarSimulationAction rerunPrompt={rerunPrompt} />
      </section>

      <div className="mx-3 h-px bg-glass-border" />

      <section className="px-4 py-3">
        <p className="text-caption font-medium tracking-widest text-muted-foreground uppercase">
          Recent
        </p>
      </section>

      <nav
        aria-label="Recent runs"
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-2 pb-4"
      >
        {runs.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            No runs yet. Start a simulation.
          </p>
        ) : (
          runs.map((run) => {
            const isActive = pathname === `/runs/${run.id}`;
            return (
              <div
                key={run.id}
                className={cn(
                  "group flex items-stretch gap-0.5 rounded-lg transition-all duration-200",
                  isActive
                    ? "glass-card border-l-2 border-l-foreground"
                    : "hover:bg-white/4",
                )}
              >
                <Link
                  href={`/runs/${run.id}`}
                  className={cn(
                    "min-w-0 flex-1 rounded-md px-3 py-2",
                    isActive
                      ? "border-l-2 border-l-foreground pl-[10px]"
                      : "border-l-2 border-l-transparent",
                  )}
                  title={run.title}
                >
                  <p className="line-clamp-2 text-body leading-snug wrap-break-word text-foreground">
                    {run.title}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        run.status === "running"
                          ? "bg-agent-architect"
                          : run.status === "complete"
                            ? "bg-agent-backend"
                            : run.status === "failed"
                              ? "bg-destructive"
                              : "bg-muted-foreground",
                      )}
                    />
                    <span className="truncate">{run.updatedAt}</span>
                  </p>
                </Link>
                <form action={deleteRunAction}>
                  <input type="hidden" name="runId" value={run.id} />
                  <input type="hidden" name="activePath" value={pathname} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete run: ${run.title}`}
                    className="my-1 mr-1 size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-70"
                  >
                    <X className="size-3.5" />
                  </Button>
                </form>
              </div>
            );
          })
        )}
      </nav>
    </div>
  );
}
