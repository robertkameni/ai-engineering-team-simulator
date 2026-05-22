import Link from "next/link";
import dynamic from "next/dynamic";
import { Home } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RunStatusPill } from "@/features/simulation/run-status-pill";
import type { MockRun } from "@/features/agents/types";
import type { RunStatus } from "@/features/agents/types";
import { cn } from "@/lib/utils";
import { SavedRunMobileActions } from "./saved-run-mobile-actions";

const ExportRunButton = dynamic(
  () =>
    import("@/features/workspace/export-run-button").then(
      (module) => module.ExportRunButton,
    ),
  {
    loading: () => (
      <div
        className="glass-card h-8 w-8 shrink-0 rounded-md border border-glass-border"
        aria-hidden
      />
    ),
  },
);

interface WorkspaceHeaderSavedProps {
  title: string;
  status: RunStatus;
  subtitle?: string;
  run: MockRun;
  showArtifactsAction: boolean;
  className?: string;
}

export function WorkspaceHeaderSaved({
  title,
  status,
  subtitle,
  run,
  showArtifactsAction,
  className,
}: WorkspaceHeaderSavedProps) {
  return (
    <header
      className={cn(
        "@container/workspace-header glass-panel flex shrink-0 items-center justify-between gap-2 border-b-0 border-glass-border px-3 py-2.5 @[720px]/app-shell:gap-3 @[720px]/app-shell:px-4 @[720px]/app-shell:py-3",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <SavedRunMobileActions showArtifactsAction={showArtifactsAction} />
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          asChild
        >
          <Link href="/" aria-label="Back to home" title="Back to home">
            <Home className="size-4" />
          </Link>
        </Button>
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
        <ExportRunButton run={run} />
        <RunStatusPill
          status={status}
          artifactsStatus={run.artifactsStatus}
          compactOnMobile
        />
      </div>
    </header>
  );
}
