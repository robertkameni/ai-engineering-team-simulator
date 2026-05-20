"use client";

import { Menu, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RunStatusPill } from "@/features/simulation/run-status-pill";
import { ExportRunButton } from "@/features/workspace/export-run-button";
import { useWorkspaceMobile } from "@/features/workspace/workspace-mobile-context";
import type { MockRun } from "@/features/agents/types";
import type { RunStatus } from "@/features/agents/types";
import { cn } from "@/lib/utils";

interface WorkspaceHeaderProps {
  title: string;
  status: RunStatus;
  subtitle?: string;
  run?: MockRun;
  className?: string;
}

export function WorkspaceHeader({
  title,
  status,
  subtitle,
  run,
  className,
}: WorkspaceHeaderProps) {
  const mobile = useWorkspaceMobile();

  return (
    <header
      className={cn(
        "@container/workspace-header glass-panel flex shrink-0 items-center justify-between gap-2 border-b-0 border-glass-border px-3 py-2.5 @[720px]/app-shell:gap-3 @[720px]/app-shell:px-4 @[720px]/app-shell:py-3",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {mobile ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 @[720px]/app-shell:hidden"
            onClick={mobile.openSidebar}
            aria-label="Open menu"
          >
            <Menu className="size-4" />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-body font-semibold tracking-tight text-foreground @[720px]/app-shell:text-title">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 hidden truncate text-caption text-muted-foreground @[720px]/app-shell:block">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 @[720px]/app-shell:gap-2">
        {mobile?.showArtifactsAction ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="glass-card size-8 border-glass-border @[960px]/app-shell:hidden"
            onClick={mobile.openArtifacts}
            aria-label="View artifacts"
          >
            <Layers className="size-4" />
          </Button>
        ) : null}
        {run ? <ExportRunButton run={run} /> : null}
        <RunStatusPill status={status} compactOnMobile />
      </div>
    </header>
  );
}
