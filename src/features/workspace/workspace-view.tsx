import { AppShell } from "@/features/workspace/app-shell";
import { WorkspaceHeader } from "@/features/workspace/workspace-header";
import { MessageThread } from "@/features/simulation/message-thread";
import { PromptComposer } from "@/features/simulation/prompt-composer";
import { MOCK_ACTIVE_RUN } from "@/features/simulation/mock-data";
import type { MockRun } from "@/features/agents/types";

interface WorkspaceViewProps {
  run?: MockRun;
  showEmptyThread?: boolean;
  initialPrompt?: string;
}

export function WorkspaceView({
  run = MOCK_ACTIVE_RUN,
  showEmptyThread = false,
  initialPrompt,
}: WorkspaceViewProps) {
  return (
    <AppShell>
      <WorkspaceHeader
        title={run.title}
        status={run.status}
        subtitle={run.userPrompt}
      />
      <MessageThread
        messages={showEmptyThread ? [] : run.messages}
        empty={showEmptyThread}
      />
      <PromptComposer
        key={initialPrompt ?? "empty"}
        disabled={run.status === "running"}
        defaultValue={initialPrompt ?? ""}
      />
    </AppShell>
  );
}
