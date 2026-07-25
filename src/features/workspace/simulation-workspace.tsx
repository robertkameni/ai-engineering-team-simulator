"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { teamMemberPreview } from "@/lib/team-roster-preview";
import type { SidebarRunItemData } from "@/features/workspace/sidebar-types";
import { useWorkspaceMobile } from "@/features/workspace/workspace-mobile-context";
import { truncateTitle } from "@/lib/truncate-title";

interface SimulationWorkspaceProps {
  userPrompt: string;
  autoStart?: boolean;
  initialRecentRuns?: SidebarRunItemData[];
  isAuthenticated?: boolean;
  userEmail?: string | null;
}

export function SimulationWorkspace({
  userPrompt,
  autoStart = true,
  initialRecentRuns,
  isAuthenticated = false,
  userEmail = null,
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
    debateOutcome,
    stackValidationFailed,
    crossValidationFailed,
    start,
  } = useSimulationStream();

  const [currentPrompt, setCurrentPrompt] = useState(userPrompt);
  const [prevUserPrompt, setPrevUserPrompt] = useState(userPrompt);
  const mobile = useWorkspaceMobile();
  const artifactsSheetOpenedRef = useRef(false);

  if (userPrompt !== prevUserPrompt) {
    setPrevUserPrompt(userPrompt);
    setCurrentPrompt(userPrompt);
  }

  const displayTitle = truncateTitle(currentPrompt);

  useEffect(() => {
    if (status === "running") {
      artifactsSheetOpenedRef.current = false;
    }
  }, [status]);

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
    if (!autoStart) {
      return;
    }
    const controller = new AbortController();
    void start(userPrompt, { signal: controller.signal });
    return () => controller.abort();
  }, [autoStart, userPrompt, start]);

  const rerunSimulation = useCallback(
    (overridePrompt?: string) => {
      const trimmed = (overridePrompt ?? currentPrompt).trim();
      if (trimmed) {
        setCurrentPrompt(trimmed);
        void start(trimmed);
      }
    },
    [currentPrompt, start],
  );

  const promptRunSession = useMemo(
    () => ({
      currentPrompt,
      canRerun: status !== "running",
      onRerun: (prompt: string) => {
        rerunSimulation(prompt);
      },
    }),
    [currentPrompt, status, rerunSimulation],
  );

  const showBootstrapping =
    status === "running" && messages.length === 0 && !error;

  const debateProgress = useMemo(
    () => debateProgressFromMessages(messages, activeAgent),
    [messages, activeAgent],
  );

  const exportRun = useMemo<MockRun>(
    () => ({
      id: runId ?? "live",
      title: displayTitle,
      userPrompt: currentPrompt,
      status,
      updatedAt: new Date().toISOString(),
      messages,
      artifacts,
      artifactsStatus,
      debateOutcome,
      stackValidationFailed,
      crossValidationFailed,
    }),
    [
      runId,
      displayTitle,
      currentPrompt,
      status,
      messages,
      artifacts,
      artifactsStatus,
      debateOutcome,
      stackValidationFailed,
      crossValidationFailed,
    ],
  );

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
      debateOutcome={debateOutcome}
      stackValidationFailed={stackValidationFailed}
      crossValidationFailed={crossValidationFailed}
    >
      <WorkspaceHeader
        title={displayTitle}
        status={status}
        subtitle={currentPrompt}
        artifactsStatus={artifactsStatus}
        debateProgress={debateProgress}
        isAuthenticated={isAuthenticated}
        userEmail={userEmail}
        releaseRunId={runId}
        templateId={teamRoster?.templateId}
        run={messages.length > 0 ? exportRun : undefined}
      />
      <WorkspaceMain>
        {error ? (
          <SimulationErrorBanner
            message={error}
            onRetry={() => void start(currentPrompt.trim())}
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
        <MessageThread
          messages={messages}
          empty={status === "idle" && messages.length === 0}
          loading={showBootstrapping}
        />
      </WorkspaceMain>
      <PromptComposer
        disabled={status === "running"}
        value={currentPrompt}
        onChange={setCurrentPrompt}
        onSimulate={start}
        runSession={promptRunSession}
      />
    </AppShell>
  );
}
