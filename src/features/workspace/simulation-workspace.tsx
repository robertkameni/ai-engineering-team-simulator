"use client";

import { useEffect, useRef } from "react";

import { AppShell } from "@/features/workspace/app-shell";
import { WorkspaceMain } from "@/features/workspace/workspace-main";
import { WorkspaceHeader } from "@/features/workspace/workspace-header";
import { MessageThread } from "@/features/simulation/message-thread";
import { PromptComposer } from "@/features/simulation/prompt-composer";
import { SimulationErrorBanner } from "@/features/simulation/simulation-error-banner";
import { AgentTypingIndicator } from "@/features/simulation/agent-typing-indicator";
import { useSimulationStream } from "@/features/simulation/use-simulation-stream";

interface SimulationWorkspaceProps {
  userPrompt: string;
  title: string;
}

export function SimulationWorkspace({
  userPrompt,
  title,
}: SimulationWorkspaceProps) {
  const { messages, status, error, activeAgent, start } = useSimulationStream();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void start(userPrompt);
  }, [userPrompt, start]);

  const showBootstrapping =
    status === "running" && messages.length === 0 && !error;

  const showHandoff =
    status === "running" &&
    activeAgent != null &&
    messages.every((message) => !message.isStreaming);

  return (
    <AppShell>
      <WorkspaceHeader
        title={title}
        status={status}
        subtitle={userPrompt}
      />
      <WorkspaceMain>
        {error ? (
          <SimulationErrorBanner
            message={error}
            onRetry={() => void start(userPrompt)}
          />
        ) : null}
        {showBootstrapping ? (
          <AgentTypingIndicator role="pm" label="Assembling the team…" />
        ) : null}
        {showHandoff && activeAgent ? (
          <AgentTypingIndicator
            role={activeAgent}
          label={
            activeAgent === "architect"
              ? "Reasoning through the architecture…"
              : activeAgent === "backend"
                ? "Drafting the backend plan…"
                : activeAgent === "frontend"
                  ? "Designing the frontend experience…"
                  : "Joining the discussion…"
          }
          />
        ) : null}
        <MessageThread
          messages={messages}
          empty={status === "idle" && messages.length === 0}
        />
      </WorkspaceMain>
      <PromptComposer
        disabled={status === "running"}
        defaultValue={userPrompt}
        onSimulate={start}
      />
    </AppShell>
  );
}
