import { AppShell } from "@/features/workspace/app-shell";
import { WorkspaceMain } from "@/features/workspace/workspace-main";
import { WorkspaceHeader } from "@/features/workspace/workspace-header";
import { MessageThread } from "@/features/simulation/message-thread";
import { PromptComposer } from "@/features/simulation/prompt-composer";
import type { MockRun } from "@/features/agents/types";

interface WorkspaceViewProps {
  run: MockRun;
  showEmptyThread?: boolean;
  initialPrompt?: string;
  onSimulate?: (prompt: string) => void | Promise<void>;
}

export function WorkspaceView({
  run,
  showEmptyThread = false,
  initialPrompt,
  onSimulate,
}: WorkspaceViewProps) {
  return (
    <AppShell
      artifacts={run.artifacts}
      artifactsStatus={run.artifactsStatus ?? "idle"}
    >
      <WorkspaceHeader
        title={run.title}
        status={run.status}
        subtitle={run.userPrompt}
      />
      <WorkspaceMain>
        <MessageThread
          messages={showEmptyThread ? [] : run.messages}
          empty={showEmptyThread}
        />
      </WorkspaceMain>
      <PromptComposer
        key={initialPrompt ?? "empty"}
        disabled={run.status === "running"}
        defaultValue={initialPrompt ?? ""}
        onSimulate={onSimulate}
      />
    </AppShell>
  );
}
