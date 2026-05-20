"use client";

import { useEffect, useMemo, useRef } from "react";

import type { MockRun } from "@/features/agents/types";
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
  const {
    messages,
    status,
    error,
    runId,
    activeAgent,
    artifacts,
    artifactsStatus,
    start,
  } = useSimulationStream();
  
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

  const debateComplete =
    status === "running" &&
    messages.length > 0 &&
    messages.every((message) => !message.isStreaming);

  const panelArtifactsStatus =
    artifactsStatus === "pending" && debateComplete
      ? "generating"
      : artifactsStatus;

  const exportRun = useMemo<MockRun>(
    () => ({
      id: runId ?? "live",
      title,
      userPrompt,
      status,
      updatedAt: new Date().toISOString(),
      messages,
      artifacts,
      artifactsStatus: panelArtifactsStatus,
    }),
    [
      runId,
      title,
      userPrompt,
      status,
      messages,
      artifacts,
      panelArtifactsStatus,
    ],
  );

  return (
    <AppShell artifacts={artifacts} artifactsStatus={panelArtifactsStatus}>
      <WorkspaceHeader
        title={title}
        status={status}
        subtitle={userPrompt}
        run={messages.length > 0 ? exportRun : undefined}
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
                ? "Drafting the architecture…"
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
          loading={showBootstrapping}
        />
      </WorkspaceMain>
      <PromptComposer
        key={userPrompt}
        disabled={status === "running"}
        defaultValue={userPrompt}
        onSimulate={start}
      />
    </AppShell>
  );
}
