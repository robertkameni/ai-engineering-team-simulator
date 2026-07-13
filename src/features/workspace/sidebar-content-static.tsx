import Link from "next/link";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidebarBrandLink } from "@/features/workspace/sidebar-brand-link";
import { deleteRunAction } from "@/features/workspace/delete-run-action";
import { SidebarSimulationAction } from "@/features/workspace/sidebar-simulation-action";
import {
  SidebarRunLinkContent,
  sidebarRunLinkClassName,
  sidebarRunRowClassName,
} from "@/features/workspace/sidebar-run-link-content";
import type { SidebarRunItemData } from "@/features/workspace/sidebar-types";

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
        <SidebarBrandLink />
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
              <div key={run.id} className={sidebarRunRowClassName(isActive)}>
                <Link
                  href={`/runs/${run.id}`}
                  className={sidebarRunLinkClassName(isActive)}
                  title={run.title}
                >
                  <SidebarRunLinkContent run={run} />
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
