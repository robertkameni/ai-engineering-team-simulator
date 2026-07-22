import type { ReactNode } from "react";

import { AppShellFrame } from "@/features/workspace/app-shell-frame";
import { ArtifactPanelStatic } from "@/features/artifacts/artifact-panel-static";
import { MessageThreadStatic } from "@/features/simulation/message-thread-static";
import { SavedRunFooter } from "@/features/workspace/saved-run-footer";
import { SavedRunMobileSheets } from "@/features/workspace/saved-run-mobile-sheets";
import { SidebarStatic } from "@/features/workspace/sidebar-static";
import { WorkspaceHeaderSaved } from "@/features/workspace/workspace-header-saved";
import { WorkspaceMain } from "@/features/workspace/workspace-main";
import type { MockRun } from "@/features/agents/types";
import type { SidebarRunItemData } from "@/features/workspace/sidebar-types";
import type { TeamRosterPreview } from "@/features/simulation/team-roster-preview";

interface SavedRunWorkspaceProps {
  run: MockRun;
  pathname: string;
  initialRecentRuns: SidebarRunItemData[];
  /** Optional slot for Suspense-streamed sidebar (arch-review F5). */
  sidebar?: ReactNode;
  teamRoster?: TeamRosterPreview | null;
  regenerateRunId?: string;
  canRegenerateArtifacts?: boolean;
  isAuthenticated?: boolean;
  userEmail?: string | null;
}

export function SavedRunWorkspace({
  run,
  pathname,
  initialRecentRuns,
  sidebar,
  teamRoster = null,
  regenerateRunId,
  canRegenerateArtifacts = false,
  isAuthenticated = false,
  userEmail = null,
}: SavedRunWorkspaceProps) {
  const artifactsStatus = run.artifactsStatus ?? "idle";
  const showArtifactPanel =
    artifactsStatus !== "idle" ||
    run.artifacts != null ||
    canRegenerateArtifacts;

  return (
    <SavedRunMobileSheets
      pathname={pathname}
      initialRecentRuns={initialRecentRuns}
      showArtifactPanel={showArtifactPanel}
      artifacts={run.artifacts ?? null}
      artifactsStatus={artifactsStatus}
      regenerateRunId={regenerateRunId}
      canRegenerateArtifacts={canRegenerateArtifacts}
      debateOutcome={run.debateOutcome ?? null}
      postApproveTruncation={run.postApproveTruncation === true}
      stackValidationFailed={run.stackValidationFailed === true}
      crossValidationFailed={run.crossValidationFailed === true}
    >
      <AppShellFrame
        sidebar={
          sidebar ?? (
            <SidebarStatic
              pathname={pathname}
              runs={initialRecentRuns}
              rerunPrompt={run.userPrompt}
            />
          )
        }
        artifacts={
          showArtifactPanel ? (
            <ArtifactPanelStatic
              artifacts={run.artifacts}
              status={artifactsStatus}
              regenerateRunId={regenerateRunId}
              canRegenerateArtifacts={canRegenerateArtifacts}
              debateMessages={run.messages.map((message) => ({
                role: message.role,
                isStreaming: message.isStreaming,
                agentTitle: message.agentTitle,
              }))}
              teamRoster={teamRoster}
              debateOutcome={run.debateOutcome ?? null}
              postApproveTruncation={run.postApproveTruncation === true}
              stackValidationFailed={run.stackValidationFailed === true}
              crossValidationFailed={run.crossValidationFailed === true}
            />
          ) : null
        }
      >
        <WorkspaceHeaderSaved
          title={run.title}
          status={run.status}
          subtitle={run.userPrompt}
          run={run}
          showArtifactsAction={showArtifactPanel}
          isAuthenticated={isAuthenticated}
          userEmail={userEmail}
          templateId={teamRoster?.templateId}
        />
        <WorkspaceMain>
          <MessageThreadStatic messages={run.messages} />
        </WorkspaceMain>
        <SavedRunFooter userPrompt={run.userPrompt} />
      </AppShellFrame>
    </SavedRunMobileSheets>
  );
}
