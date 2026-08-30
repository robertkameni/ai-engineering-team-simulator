import type { MutableRefObject } from "react";
import type { useRouter } from "next/navigation";

import type {
  AgentRole,
  ArtifactsPanelStatus,
  RunStatus,
  SimulationMessage,
} from "@/lib/types";
import type { TeamRosterPreview } from "@/lib/team-roster-preview";
import type { SimulationStreamEvent } from "@/lib/simulation-stream";

import { formatMessageTime } from "@/lib/format-time";

import { createTextDeltaCoalescer } from "./text-delta-coalescer";
import { shouldFetchArtifactsOnDone } from "./should-fetch-artifacts-on-done";
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
  artifactsPanelFromStreamRef: { current: ArtifactsPanelStatus | null };
};

export type SimulationStreamEventHandler = {
  handle: (event: SimulationStreamEvent) => Promise<void>;
  /** Flush coalesced text-delta before abort/unmount so last tokens render (F1). */
  flushPendingTextDeltas: () => void;
  dispose: () => void;
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

function markActiveMessageIdle(
  context: SimulationStreamEventContext,
): void {
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
}

function flushAndMarkStreamSettled(
  context: SimulationStreamEventContext,
  textDeltaCoalescer: { flush: () => void },
): void {
  textDeltaCoalescer.flush();
  context.streamSettledRef.current = true;
}

async function handleStreamErrorEvent(
  context: SimulationStreamEventContext,
  textDeltaCoalescer: { flush: () => void },
  artifactSetters: ArtifactPollSetters,
  message: string,
): Promise<void> {
  flushAndMarkStreamSettled(context, textDeltaCoalescer);
  markActiveMessageIdle(context);
  context.setActiveAgent(null);
  context.setStatus("failed");
  context.setError(message);

  const runId = context.currentRunIdRef.current;
  if (runId) {
    await pollArtifactsUntilSettled(runId, artifactSetters, context.signal);
    return;
  }

  if (context.isActive()) {
    context.setArtifactsStatus("unavailable");
  }
}

async function handleStreamDoneEvent(
  context: SimulationStreamEventContext,
  textDeltaCoalescer: { flush: () => void },
  artifactSetters: ArtifactPollSetters,
  event: Extract<SimulationStreamEvent, { type: "done" }>,
): Promise<void> {
  flushAndMarkStreamSettled(context, textDeltaCoalescer);
  if (!context.isActive()) {
    return;
  }

  context.setRunId(event.runId);
  context.currentRunIdRef.current = event.runId;

  const shouldFetch = shouldFetchArtifactsOnDone({
    artifactTimeout: event.artifactTimeout,
    alreadyFetchedViaStream: context.artifactsSettledViaStreamRef.current,
  });

  let finalPanel: ArtifactsPanelStatus | null =
    context.artifactsPanelFromStreamRef.current;
  if (shouldFetch && event.artifactTimeout === true) {
    finalPanel = await pollArtifactsUntilSettled(
      event.runId,
      artifactSetters,
      context.signal,
    );
  } else if (shouldFetch) {
    finalPanel = await fetchArtifactsOnce(
      event.runId,
      artifactSetters,
      context.signal,
    );
  }

  if (!context.isActive()) {
    return;
  }

  finalizeDoneStatus(context, finalPanel);
  context.router.replace(`/runs/${event.runId}`);
}

export function createSimulationStreamEventHandler(
  context: SimulationStreamEventContext,
): SimulationStreamEventHandler {
  const artifactSetters: ArtifactPollSetters = {
    setArtifacts: context.setArtifacts,
    setArtifactsStatus: context.setArtifactsStatus,
    setDebateOutcome: context.setDebateOutcome,
    setStackValidationFailed: context.setStackValidationFailed,
    setCrossValidationFailed: context.setCrossValidationFailed,
  };

  const textDeltaCoalescer = createTextDeltaCoalescer({
    appendDelta: (messageId, delta) => {
      if (!context.isActive()) {
        return;
      }
      context.setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId
            ? { ...message, content: message.content + delta }
            : message,
        ),
      );
    },
  });

  const handle = async (event: SimulationStreamEvent) => {
    if (event.type === "run_started") {
      context.currentRunIdRef.current = event.runId;
      context.setRunId(event.runId);
      context.setArtifactsStatus("pending");
      context.artifactsSettledViaStreamRef.current = false;
      context.artifactsPanelFromStreamRef.current = null;
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
      textDeltaCoalescer.flush();
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
      textDeltaCoalescer.flush();
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
      textDeltaCoalescer.flush();
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

      textDeltaCoalescer.enqueue(activeId, event.delta);
      return;
    }

    if (event.type === "agent_end") {
      textDeltaCoalescer.flush();
      markActiveMessageIdle(context);
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

      context.artifactsPanelFromStreamRef.current = await fetchArtifactsOnce(
        runId,
        artifactSetters,
        context.signal,
      );
      return;
    }

    if (event.type === "heartbeat") {
      return;
    }

    if (event.type === "error") {
      await handleStreamErrorEvent(
        context,
        textDeltaCoalescer,
        artifactSetters,
        event.message,
      );
      return;
    }

    if (event.type === "done") {
      await handleStreamDoneEvent(
        context,
        textDeltaCoalescer,
        artifactSetters,
        event,
      );
    }
  };

  return {
    handle,
    flushPendingTextDeltas: () => textDeltaCoalescer.flush(),
    dispose: () => textDeltaCoalescer.dispose(),
  };
}
