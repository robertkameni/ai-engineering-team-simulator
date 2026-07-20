import type { MutableRefObject } from "react";
import type { useRouter } from "next/navigation";

import type {
  AgentRole,
  RunStatus,
  SimulationMessage,
} from "@/features/agents/types";
import type { TeamRosterPreview } from "@/features/simulation/team-roster-preview";
import type { SimulationStreamEvent } from "@/lib/simulation-stream";

import { formatMessageTime } from "@/lib/format-time";

import {
  fetchArtifactsOnce,
  pollArtifactsUntilSettled,
  type ArtifactPollSetters,
} from "./simulation-stream-polling";

export type SimulationStreamEventContext = ArtifactPollSetters & {
  signal: AbortSignal;
  isActive: () => boolean;
  currentRunIdRef: { current: string | null };
  activeMessageIdRef: MutableRefObject<string | null>;
  setRunId: (runId: string) => void;
  setStatus: (status: RunStatus | ((current: RunStatus) => RunStatus)) => void;
  setError: (error: string | null | ((current: string | null) => string | null)) => void;
  setActiveAgent: (role: AgentRole | null) => void;
  setMessages: (
    messages: SimulationMessage[] | ((current: SimulationMessage[]) => SimulationMessage[]),
  ) => void;
  setTeamRoster: (roster: TeamRosterPreview | null) => void;
  router: ReturnType<typeof useRouter>;
  streamSettledRef: { current: boolean };
  /** Set when SSE delivered `all_artifacts_complete` — skip poll storm. */
  artifactsSettledViaStreamRef: { current: boolean };
};

function finalizeDoneStatus(
  context: SimulationStreamEventContext,
  finalPanel: string | null,
): void {
  if (finalPanel === "unavailable") {
    context.setStatus("complete");
    context.setError((prev) => prev ?? "Artifact synthesis failed");
  } else if (finalPanel === "ready") {
    context.setError(null);
    context.setStatus((current) => (current === "failed" ? current : "complete"));
  } else if (finalPanel != null) {
    context.setStatus((current) => (current === "failed" ? current : "complete"));
  }
}

export function createSimulationStreamEventHandler(
  context: SimulationStreamEventContext,
): (event: SimulationStreamEvent) => Promise<void> {
  const artifactSetters: ArtifactPollSetters = {
    setArtifacts: context.setArtifacts,
    setArtifactsStatus: context.setArtifactsStatus,
    setDebateOutcome: context.setDebateOutcome,
    setStackValidationFailed: context.setStackValidationFailed,
    setCrossValidationFailed: context.setCrossValidationFailed,
  };

  return async (event: SimulationStreamEvent) => {
    if (event.type === "run_started") {
      context.currentRunIdRef.current = event.runId;
      context.setRunId(event.runId);
      context.setArtifactsStatus("pending");
      context.artifactsSettledViaStreamRef.current = false;
      return;
    }

    if (event.type === "team_ready") {
      context.setTeamRoster({
        templateId: event.templateId,
        members: event.members,
      });
      return;
    }

    if (event.type === "agent_start") {
      context.setActiveAgent(event.role);
      const id = crypto.randomUUID();
      context.activeMessageIdRef.current = id;
      context.setMessages((prev) => [
        ...prev,
        {
          id,
          role: event.role,
          agentName: event.name,
          agentTitle: event.title,
          content: "",
          isStreaming: true,
          activeTools: [],
          createdAt: formatMessageTime(new Date()),
        },
      ]);
      return;
    }

    if (event.type === "tool_start") {
      const activeId = context.activeMessageIdRef.current;
      if (!activeId) return;

      context.setMessages((prev) =>
        prev.map((message) =>
          message.id === activeId
            ? {
                ...message,
                activeTools: [
                  ...(message.activeTools ?? []),
                  { name: event.toolName, args: event.args },
                ],
              }
            : message,
        ),
      );
      return;
    }

    if (event.type === "tool_end") {
      const activeId = context.activeMessageIdRef.current;
      if (!activeId) return;

      context.setMessages((prev) =>
        prev.map((message) => {
          if (message.id !== activeId) return message;
          const tools = [...(message.activeTools ?? [])];
          const index = tools.findIndex((tool) => tool.name === event.toolName);
          if (index !== -1) tools.splice(index, 1);
          return { ...message, activeTools: tools };
        }),
      );
      return;
    }

    if (event.type === "text-delta") {
      const activeId = context.activeMessageIdRef.current;
      if (!activeId) return;

      context.setMessages((prev) =>
        prev.map((message) =>
          message.id === activeId
            ? { ...message, content: message.content + event.delta }
            : message,
        ),
      );
      return;
    }

    if (event.type === "agent_end") {
      const activeId = context.activeMessageIdRef.current;

      if (activeId) {
        context.setMessages((prev) =>
          prev.map((message) =>
            message.id === activeId
              ? { ...message, isStreaming: false, activeTools: [] }
              : message,
          ),
        );
      }
      context.activeMessageIdRef.current = null;
      context.setActiveAgent(null);
      return;
    }

    if (event.type === "artifacts_start") {
      context.setArtifactsStatus("generating");
      return;
    }

    if (event.type === "artifact_complete") {
      return;
    }

    if (event.type === "all_artifacts_complete") {
      context.artifactsSettledViaStreamRef.current = true;
      const runId = context.currentRunIdRef.current;
      if (!runId || !context.isActive()) {
        return;
      }

      await fetchArtifactsOnce(runId, artifactSetters, context.signal);
      return;
    }

    if (event.type === "heartbeat") {
      return;
    }

    if (event.type === "error") {
      context.streamSettledRef.current = true;
      context.setError(event.message);
      context.setStatus("failed");
      context.setActiveAgent(null);

      const activeId = context.activeMessageIdRef.current;
      if (activeId) {
        context.setMessages((prev) =>
          prev.map((message) =>
            message.id === activeId
              ? { ...message, isStreaming: false, activeTools: [] }
              : message,
          ),
        );
        context.activeMessageIdRef.current = null;
      }

      if (context.currentRunIdRef.current) {
        await pollArtifactsUntilSettled(
          context.currentRunIdRef.current,
          artifactSetters,
          context.signal,
        );
      } else if (context.isActive()) {
        context.setArtifactsStatus("unavailable");
      }
      return;
    }

    if (event.type === "done") {
      context.streamSettledRef.current = true;

      if (!context.isActive()) return;

      context.setRunId(event.runId);
      context.currentRunIdRef.current = event.runId;

      const shouldPoll =
        event.artifactTimeout === true ||
        !context.artifactsSettledViaStreamRef.current;

      const finalPanel = shouldPoll
        ? await pollArtifactsUntilSettled(
            event.runId,
            artifactSetters,
            context.signal,
          )
        : await fetchArtifactsOnce(
            event.runId,
            artifactSetters,
            context.signal,
          );

      if (!context.isActive()) return;

      finalizeDoneStatus(context, finalPanel);
      context.router.replace(`/runs/${event.runId}`);
    }
  };
}
