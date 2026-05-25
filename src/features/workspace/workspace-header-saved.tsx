import Link from "next/link";
import { Home } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RunStatusPill } from "@/features/simulation/run-status-pill";
import { RunUsagePill } from "@/features/simulation/run-usage-pill";
import { AuthStatusBadge } from "@/features/workspace/auth-status-badge";
import { ExportRunButton } from "@/features/workspace/export-run-button";
import type { MockRun } from "@/features/agents/types";
import type { RunStatus } from "@/features/agents/types";
import { cn } from "@/lib/utils";
import { SavedRunMobileActions } from "./saved-run-mobile-actions";
import { WorkspaceHeaderActions } from "./workspace-header-actions";

interface WorkspaceHeaderSavedProps {
  title: string;
  status: RunStatus;
  subtitle?: string;
  run: MockRun;
  showArtifactsAction: boolean;
  isAuthenticated?: boolean;
  className?: string;
}

export function WorkspaceHeaderSaved({
  title,
  status,
  subtitle,
  run,
  showArtifactsAction,
  isAuthenticated = false,
  className,
}: WorkspaceHeaderSavedProps) {
  return (
    <header
      className={cn(
        "@container/workspace-header glass-panel grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 border-b-0 border-glass-border px-3 py-2.5 @[720px]/app-shell:gap-x-3 @[720px]/app-shell:px-4 @[720px]/app-shell:py-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
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
      <WorkspaceHeaderActions>
        <AuthStatusBadge isAuthenticated={isAuthenticated} />
        <ExportRunButton run={run} />
        {run.usage ? (
          <RunUsagePill usage={run.usage} compactOnMobile />
        ) : null}
        <RunStatusPill
          status={status}
          artifactsStatus={run.artifactsStatus}
          compactOnMobile
        />
      </WorkspaceHeaderActions>
    </header>
  );
}
