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

interface SavedRunWorkspaceProps {
  run: MockRun;
  pathname: string;
  initialRecentRuns: SidebarRunItemData[];
  regenerateRunId?: string;
  canRegenerateArtifacts?: boolean;
}

/** Server-first workspace for saved runs — minimal client JS. */
export function SavedRunWorkspace({
  run,
  pathname,
  initialRecentRuns,
  regenerateRunId,
  canRegenerateArtifacts = false,
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
    >
      <AppShellFrame
        sidebar={
          <SidebarStatic pathname={pathname} runs={initialRecentRuns} />
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
        />
        <WorkspaceMain>
          <MessageThreadStatic messages={run.messages} />
        </WorkspaceMain>
        <SavedRunFooter />
      </AppShellFrame>
    </SavedRunMobileSheets>
  );
}
