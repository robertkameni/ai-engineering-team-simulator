"use client";

import { useEffect, useRef } from "react";

import { AppShell } from "@/features/workspace/app-shell";
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
  const { messages, status, error, start } = useSimulationStream();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void start(userPrompt);
  }, [userPrompt, start]);

  const showTyping =
    status === "running" && messages.length === 0 && !error;

  return (
    <AppShell>
      <WorkspaceHeader
        title={title}
        status={status}
        subtitle={userPrompt}
      />
      {error ? (
        <SimulationErrorBanner
          message={error}
          onRetry={() => void start(userPrompt)}
        />
      ) : null}
      {showTyping ? (
        <AgentTypingIndicator role="pm" label="Analyzing your idea…" />
      ) : null}
      <MessageThread
        messages={messages}
        empty={status === "idle" && messages.length === 0}
      />
      <PromptComposer
        disabled={status === "running"}
        defaultValue={userPrompt}
        onSimulate={start}
      />
    </AppShell>
  );
}
