"use client";

import Link from "next/link";
import { Home, Menu, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RunStatusPill } from "@/features/simulation/run-status-pill";
import { RunUsagePill } from "@/features/simulation/run-usage-pill";
import { ArtifactStatusPill } from "@/features/artifacts/artifact-status-pill";
import { AuthStatusBadge } from "@/features/workspace/auth-status-badge";
import { ExportRunButton } from "@/features/workspace/export-run-button";
import { SignOutButton } from "@/features/workspace/sign-out-button";
import { WorkspaceHeaderActions } from "@/features/workspace/workspace-header-actions";
import { workspaceHeaderHomeButtonClass } from "@/features/workspace/workspace-header-button-styles";
import { useWorkspaceMobile } from "@/features/workspace/workspace-mobile-context";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { MockRun } from "@/features/agents/types";
import type { RunStatus } from "@/features/agents/types";
import type { ArtifactsPanelStatus } from "@/features/artifacts/types";
import type { DebateProgress } from "@/features/artifacts/artifact-panel-phase";
import { cn } from "@/lib/utils";

interface WorkspaceHeaderProps {
  title: string;
  status: RunStatus;
  subtitle?: string;
  run?: MockRun;
  artifactsStatus?: ArtifactsPanelStatus;
  debateProgress?: DebateProgress;
  isAuthenticated?: boolean;
  userEmail?: string | null;
  releaseRunId?: string | null;
  templateId?: TeamTemplateId;
  className?: string;
}

export function WorkspaceHeader({
  title,
  status,
  subtitle,
  run,
  artifactsStatus = "idle",
  debateProgress,
  isAuthenticated = false,
  userEmail = null,
  releaseRunId = null,
  templateId,
  className,
}: WorkspaceHeaderProps) {
  const mobile = useWorkspaceMobile();

  return (
    <header
      className={cn(
        "@container/workspace-header glass-panel grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 border-b-0 border-glass-border px-3 py-2.5 @[720px]/app-shell:gap-x-3 @[720px]/app-shell:px-4 @[720px]/app-shell:py-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        {mobile ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 max-[719px]:inline-flex min-[720px]:hidden"
            onClick={mobile.openSidebar}
            aria-label="Open menu"
          >
            <Menu className="size-4" />
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="icon"
          className={workspaceHeaderHomeButtonClass}
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
        {mobile?.showArtifactsAction ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="glass-card size-8 border-glass-border max-[959px]:inline-flex min-[960px]:hidden"
            onClick={mobile.openArtifacts}
            aria-label="Expand artifacts"
            title="Expand artifacts"
          >
            <Layers className="size-4" />
          </Button>
        ) : null}
        {isAuthenticated ? (
          <SignOutButton email={userEmail} releaseRunId={releaseRunId} />
        ) : (
          <AuthStatusBadge isAuthenticated={false} />
        )}
        {run ? (
          <ExportRunButton
            run={run}
            isAuthenticated={isAuthenticated}
            templateId={templateId}
          />
        ) : null}
        {run?.usage ? (
          <RunUsagePill usage={run.usage} compactOnMobile />
        ) : null}
        {artifactsStatus === "pending" || artifactsStatus === "unavailable" ? (
          <ArtifactStatusPill
            status={artifactsStatus}
            debateProgress={debateProgress}
          />
        ) : null}
        <RunStatusPill
          status={status}
          artifactsStatus={artifactsStatus}
          compactOnMobile
        />
      </WorkspaceHeaderActions>
    </header>
  );
}
