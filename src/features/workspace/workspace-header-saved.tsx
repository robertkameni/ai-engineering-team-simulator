import { RunStatusPill } from "@/features/simulation/run-status-pill";
import { RunUsagePill } from "@/features/simulation/run-usage-pill";
import { AuthStatusBadge } from "@/features/workspace/auth-status-badge";
import { ExportRunButton } from "@/features/workspace/export-run-button";
import { SignOutButton } from "@/features/workspace/sign-out-button";
import { SavedRunMobileActions } from "@/features/workspace/saved-run-mobile-actions";
import { WorkspaceHeaderFrame } from "@/features/workspace/workspace-header-frame";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { MockRun } from "@/lib/types";
import type { RunStatus } from "@/lib/types";

interface WorkspaceHeaderSavedProps {
  title: string;
  status: RunStatus;
  subtitle?: string;
  run: MockRun;
  showArtifactsAction: boolean;
  isAuthenticated?: boolean;
  userEmail?: string | null;
  templateId?: TeamTemplateId;
  className?: string;
}

export function WorkspaceHeaderSaved({
  title,
  status,
  subtitle,
  run,
  showArtifactsAction,
  isAuthenticated = false,
  userEmail = null,
  templateId,
  className,
}: WorkspaceHeaderSavedProps) {
  return (
    <WorkspaceHeaderFrame
      className={className}
      title={title}
      subtitle={subtitle}
      brandLeading={
        <SavedRunMobileActions showArtifactsAction={showArtifactsAction} />
      }
      actions={
        <>
          {isAuthenticated ? (
            <SignOutButton email={userEmail} releaseRunId={run.id} />
          ) : (
            <AuthStatusBadge isAuthenticated={false} />
          )}
          <ExportRunButton
            run={run}
            isAuthenticated={isAuthenticated}
            templateId={templateId}
          />
          {run.usage ? (
            <RunUsagePill usage={run.usage} compactOnMobile />
          ) : null}
          <RunStatusPill
            status={status}
            artifactsStatus={run.artifactsStatus}
            compactOnMobile
          />
        </>
      }
    />
  );
}
