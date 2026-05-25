import dynamic from "next/dynamic";

import { AppShell } from "@/features/workspace/app-shell";
import { WorkspaceMain } from "@/features/workspace/workspace-main";
import { WorkspaceHeader } from "@/features/workspace/workspace-header";
import { MessageThread } from "@/features/simulation/message-thread";
import { MessageThreadStatic } from "@/features/simulation/message-thread-static";
import { PromptComposerPlaceholder } from "@/features/simulation/prompt-composer-placeholder";
import type { MockRun } from "@/features/agents/types";
import type { SidebarRunItemData } from "@/features/workspace/sidebar-types";
import {
  debateProgressFromMessages,
} from "@/features/artifacts/artifact-panel-phase";

const PromptComposer = dynamic(
  () =>
    import("@/features/simulation/prompt-composer").then(
      (module) => module.PromptComposer,
    ),
  { loading: () => <PromptComposerPlaceholder /> },
);

interface WorkspaceViewProps {
  run: MockRun;
  showEmptyThread?: boolean;
  /** Saved runs: server-render messages for faster LCP. */
  staticMessages?: boolean;
  initialPrompt?: string;
  onSimulate?: (prompt: string) => void | Promise<void>;
  regenerateRunId?: string;
  canRegenerateArtifacts?: boolean;
  initialRecentRuns?: SidebarRunItemData[];
  isAuthenticated?: boolean;
  userEmail?: string | null;
}

export function WorkspaceView({
  run,
  showEmptyThread = false,
  staticMessages = false,
  initialPrompt,
  onSimulate,
  regenerateRunId,
  canRegenerateArtifacts = false,
  initialRecentRuns,
  isAuthenticated = false,
  userEmail = null,
}: WorkspaceViewProps) {
  const messages = showEmptyThread ? [] : run.messages;
  const debateProgress = debateProgressFromMessages(messages, null);
  const thread =
    staticMessages && messages.length > 0 ? (
      <MessageThreadStatic messages={messages} />
    ) : (
      <MessageThread messages={messages} empty={showEmptyThread} />
    );

  return (
    <AppShell
      artifacts={run.artifacts}
      artifactsStatus={run.artifactsStatus ?? "idle"}
      regenerateRunId={regenerateRunId}
      canRegenerateArtifacts={canRegenerateArtifacts}
      initialRecentRuns={initialRecentRuns}
      debateProgress={debateProgress}
      debateMessages={messages.map((message) => ({
        role: message.role,
        isStreaming: message.isStreaming,
      }))}
    >
      <WorkspaceHeader
        title={run.title}
        status={run.status}
        subtitle={run.userPrompt}
        artifactsStatus={run.artifactsStatus ?? "idle"}
        debateProgress={debateProgress}
        isAuthenticated={isAuthenticated}
        userEmail={userEmail}
        run={run}
      />
      <WorkspaceMain>{thread}</WorkspaceMain>
      <PromptComposer
        key={initialPrompt ?? "empty"}
        disabled={run.status === "running"}
        defaultValue={initialPrompt ?? ""}
        onSimulate={onSimulate}
      />
    </AppShell>
  );
}
