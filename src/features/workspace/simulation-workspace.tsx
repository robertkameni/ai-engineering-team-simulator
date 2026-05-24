"use client";

import { useEffect, useMemo, useRef } from "react";

import { isSimulationAgent } from "@/ai/agents/config";
import type { MockRun } from "@/features/agents/types";
import { AppShell } from "@/features/workspace/app-shell";
import { WorkspaceMain } from "@/features/workspace/workspace-main";
import { WorkspaceHeader } from "@/features/workspace/workspace-header";
import { MessageThread } from "@/features/simulation/message-thread";
import { PromptComposer } from "@/features/simulation/prompt-composer";
import { SimulationErrorBanner } from "@/features/simulation/simulation-error-banner";
import { AgentTypingIndicator } from "@/features/simulation/agent-typing-indicator";
import { debateProgressFromMessages } from "@/features/artifacts/artifact-panel-phase";
import { useSimulationStream } from "@/features/simulation/use-simulation-stream";
import { teamMemberPreview } from "@/features/simulation/team-roster-preview";
import type { SidebarRunItemData } from "@/features/workspace/sidebar-types";
import { useWorkspaceMobile } from "@/features/workspace/workspace-mobile-context";

interface SimulationWorkspaceProps {
  userPrompt: string;
  title: string;
  initialRecentRuns?: SidebarRunItemData[];
}

export function SimulationWorkspace({
  userPrompt,
  title,
  initialRecentRuns,
}: SimulationWorkspaceProps) {
  const {
    messages,
    status,
    error,
    runId,
    activeAgent,
    artifacts,
    artifactsStatus,
    teamRoster,
    start,
  } = useSimulationStream();

  const mobile = useWorkspaceMobile();
  const artifactsSheetOpenedRef = useRef(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (artifactsStatus !== "generating" || artifactsSheetOpenedRef.current) {
      return;
    }
    if (!mobile?.showArtifactsAction) {
      return;
    }
    artifactsSheetOpenedRef.current = true;
    mobile.openArtifacts();
  }, [artifactsStatus, mobile]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void start(userPrompt);
  }, [userPrompt, start]);

  const showBootstrapping =
    status === "running" && messages.length === 0 && !error;

  const latestMessage = messages.at(-1);
  const showHandoff =
    status === "running" &&
    activeAgent != null &&
    latestMessage?.isStreaming === true &&
    latestMessage.content === "";

  const debateProgress = useMemo(
    () => debateProgressFromMessages(messages, activeAgent),
    [messages, activeAgent],
  );

  const exportRun = useMemo<MockRun>(
    () => ({
      id: runId ?? "live",
      title,
      userPrompt,
      status,
      updatedAt: new Date().toISOString(),
      messages,
      artifacts,
      artifactsStatus,
    }),
    [
      runId,
      title,
      userPrompt,
      status,
      messages,
      artifacts,
      artifactsStatus,
    ],
  );

  const activeMember =
    activeAgent != null && isSimulationAgent(activeAgent)
      ? teamMemberPreview(teamRoster, activeAgent)
      : undefined;
  const bootstrappingMember = teamMemberPreview(teamRoster, "pm");

  return (
    <AppShell
      artifacts={artifacts}
      artifactsStatus={artifactsStatus}
      initialRecentRuns={initialRecentRuns}
      debateProgress={debateProgress}
      debateMessages={messages}
      activeAgent={activeAgent}
      teamRoster={teamRoster}
    >
      <WorkspaceHeader
        title={title}
        status={status}
        subtitle={userPrompt}
        artifactsStatus={artifactsStatus}
        debateProgress={debateProgress}
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
          <AgentTypingIndicator
            role="pm"
            label="Assembling the team…"
            agentName={bootstrappingMember?.name}
            agentTitle={bootstrappingMember?.title}
          />
        ) : null}
        {showHandoff && activeAgent ? (
          <AgentTypingIndicator
            role={activeAgent}
            label="Preparing contribution…"
            agentName={activeMember?.name}
            agentTitle={activeMember?.title}
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
