"use client";

import { Menu, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RunStatusPill } from "@/features/simulation/run-status-pill";
import { RunUsagePill } from "@/features/simulation/run-usage-pill";
import { ArtifactStatusPill } from "@/features/artifacts/artifact-status-pill";
import { AuthStatusBadge } from "@/features/workspace/auth-status-badge";
import { ExportRunButton } from "@/features/workspace/export-run-button";
import { SignOutButton } from "@/features/workspace/sign-out-button";
import { WorkspaceHeaderFrame } from "@/features/workspace/workspace-header-frame";
import { useWorkspaceMobile } from "@/features/workspace/workspace-mobile-context";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { MockRun } from "@/features/agents/types";
import type { RunStatus } from "@/features/agents/types";
import type { ArtifactsPanelStatus } from "@/features/artifacts/types";
import type { DebateProgress } from "@/features/artifacts/types";

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
    <WorkspaceHeaderFrame
      className={className}
      title={title}
      subtitle={subtitle}
      brandLeading={
        mobile ? (
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
        ) : null
      }
      actions={
        <>
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
        </>
      }
    />
  );
}
