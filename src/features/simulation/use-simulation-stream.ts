"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import type { ArtifactsPanelStatus, PartialRunArtifacts } from "@/features/artifacts/types";
import type {
  AgentRole,
  DebateExitOutcome,
  RunStatus,
  SimulationMessage,
} from "@/features/agents/types";
import {
  parseSimulationEvent,
  type SimulationStreamEvent,
} from "@/lib/simulation-stream";
import type { TeamRosterPreview } from "@/features/simulation/team-roster-preview";

import { formatMessageTime } from "@/lib/format-time";

const POLL_ARTIFACT_INTERVAL_MS = 800;
/** Match artifacts route synthesis budget (approx). */
const POLL_ARTIFACT_MAX_MS = 320_000;

type ArtifactsFetchResult =
  | {
      ok: true;
      artifacts: PartialRunArtifacts | null;
      status: ArtifactsPanelStatus;
      debateOutcome: DebateExitOutcome | null;
    }
  | { ok: false; retryable: boolean };

function isRetryableArtifactsHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function fetchArtifactsState(
  id: string,
  signal?: AbortSignal,
): Promise<ArtifactsFetchResult> {
  let response: Response;
  try {
    response = await fetch(`/api/runs/${id}/artifacts`, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, retryable: false };
    }
    return { ok: false, retryable: true };
  }

  if (!response.ok) {
    return {
      ok: false,
      retryable: isRetryableArtifactsHttpStatus(response.status),
    };
  }

  const data = (await response.json()) as {
    artifacts: PartialRunArtifacts | null;
    status: ArtifactsPanelStatus;
    debateOutcome?: DebateExitOutcome | null;
  };

  return {
    ok: true,
    artifacts: data.artifacts,
    status: data.status,
    debateOutcome: data.debateOutcome ?? null,
  };
}

function waitForArtifactPoll(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, POLL_ARTIFACT_INTERVAL_MS);
    if (signal) {
      if (signal.aborted) {
        globalThis.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal.addEventListener(
        "abort",
        () => {
          globalThis.clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    }
  });
}

export interface StartSimulationOptions {
  signal?: AbortSignal;
}

export function useSimulationStream() {
  const router = useRouter();
  const [messages, setMessages] = useState<SimulationMessage[]>([]);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<AgentRole | null>(null);
  const [artifacts, setArtifacts] = useState<PartialRunArtifacts | null>(null);
  const [artifactsStatus, setArtifactsStatus] =
    useState<ArtifactsPanelStatus>("idle");
  const [teamRoster, setTeamRoster] = useState<TeamRosterPreview | null>(null);
  const [debateOutcome, setDebateOutcome] = useState<DebateExitOutcome | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);
  const activeMessageIdRef = useRef<string | null>(null);

  const panelArtifactsStatus = artifactsStatus;

  const pollArtifactsUntilSettled = useCallback(
    async (
      id: string,
      signal?: AbortSignal,
    ): Promise<ArtifactsPanelStatus | null> => {
      const isActive = () => signal == null || !signal.aborted;

      const deadline = Date.now() + POLL_ARTIFACT_MAX_MS;
      while (Date.now() < deadline) {
        if (!isActive()) return null;

        const result = await fetchArtifactsState(id, signal);

        if (!isActive()) return null;

        if (!result.ok) {
          if (result.retryable) {
            try {
              await waitForArtifactPoll(signal);
            } catch {
              return null;
            }
            continue;
          }
          if (isActive()) {
            setArtifactsStatus("unavailable");
          }
          return "unavailable";
        }

        if (isActive()) {
          setArtifacts(result.artifacts);
          setArtifactsStatus(result.status);
          setDebateOutcome(result.debateOutcome);
        }

        if (result.status === "ready") {
          return result.status;
        }

        if (result.status === "unavailable") {
          return result.status;
        }

        try {
          await waitForArtifactPoll(signal);
        } catch {
          return null;
        }
      }

      if (!isActive()) return null;

      const finalResult = await fetchArtifactsState(id, signal);
      if (!isActive()) return null;

      if (finalResult.ok) {
        setArtifacts(finalResult.artifacts);
        setArtifactsStatus(finalResult.status);
        setDebateOutcome(finalResult.debateOutcome);
        return finalResult.status;
      }

      setArtifactsStatus("unavailable");
      return "unavailable";
    },
    [],
  );

  const start = useCallback(
    async (prompt: string, options: StartSimulationOptions = {}) => {
      abortRef.current?.abort();

      const ownsController = options.signal == null;
      const abortController = ownsController ? new AbortController() : null;
      const signal = options.signal ?? abortController!.signal;

      if (abortController) {
        abortRef.current = abortController;
      } else {
        abortRef.current = null;
      }

      const isActive = () => !signal.aborted;

      if (isActive()) {
        setStatus("running");
        setError(null);
        setMessages([]);
        setRunId(null);
        setActiveAgent(null);
        setArtifacts(null);
        setArtifactsStatus("pending");
        setTeamRoster(null);
        setDebateOutcome(null);
      }
      activeMessageIdRef.current = null;
      let currentRunId: string | null = null;

      try {
        const response = await fetch("/api/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
          signal,
        });

        if (!isActive()) return;

        if (!response.ok) {
          const raw: unknown = await response.json().catch(() => null);
          const payload =
            typeof raw === "object" && raw !== null && !Array.isArray(raw)
              ? (raw as Record<string, unknown>)
              : null;
          const errorText =
            payload != null && typeof payload.error === "string"
              ? payload.error
              : undefined;
          const retryAfter =
            payload != null && typeof payload.retryAfter === "number"
              ? payload.retryAfter
              : undefined;
          const base =
            errorText ?? `Request failed (${response.status})`;
          if (response.status === 429 && retryAfter != null) {
            const minutes = Math.max(1, Math.ceil(retryAfter / 60));
            throw new Error(`${base}. Try again in about ${minutes} min.`);
          }
          throw new Error(base);
        }

        if (!response.body) {
          throw new Error("No response stream");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamSettled = false;

        const handleStreamEvent = async (event: SimulationStreamEvent) => {
          if (event.type === "run_started") {
            currentRunId = event.runId;
            setRunId(event.runId);
            setArtifactsStatus("pending");
          } else if (event.type === "team_ready") {
            setTeamRoster({
              templateId: event.templateId,
              members: event.members,
            });
          } else if (event.type === "agent_start") {
            setActiveAgent(event.role);
            const id = crypto.randomUUID();
            activeMessageIdRef.current = id;
            setMessages((prev) => [
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
          } else if (event.type === "tool_start") {
            const activeId = activeMessageIdRef.current;
            if (!activeId) return;

            setMessages((prev) =>
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
          } else if (event.type === "tool_end") {
            const activeId = activeMessageIdRef.current;
            if (!activeId) return;

            setMessages((prev) =>
              prev.map((message) => {
                if (message.id !== activeId) return message;
                const tools = [...(message.activeTools ?? [])];
                const index = tools.findIndex(
                  (tool) => tool.name === event.toolName,
                );
                if (index !== -1) tools.splice(index, 1);
                return { ...message, activeTools: tools };
              }),
            );
          } else if (event.type === "text-delta") {
            const activeId = activeMessageIdRef.current;
            if (!activeId) return;

            setMessages((prev) =>
              prev.map((message) =>
                message.id === activeId
                  ? { ...message, content: message.content + event.delta }
                  : message,
              ),
            );
          } else if (event.type === "agent_end") {
            const activeId = activeMessageIdRef.current;

            if (activeId) {
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === activeId
                    ? { ...message, isStreaming: false, activeTools: [] }
                    : message,
                ),
              );
            }
            activeMessageIdRef.current = null;
            setActiveAgent(null);
          } else if (event.type === "artifacts_start") {
            setArtifactsStatus("generating");
          } else if (event.type === "error") {
            streamSettled = true;
            setError(event.message);
            setStatus("failed");
            setActiveAgent(null);

            const activeId = activeMessageIdRef.current;
            if (activeId) {
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === activeId
                    ? { ...message, isStreaming: false, activeTools: [] }
                    : message,
                ),
              );
              activeMessageIdRef.current = null;
            }

            if (currentRunId) {
              await pollArtifactsUntilSettled(currentRunId, signal);
            } else if (isActive()) {
              setArtifactsStatus("unavailable");
            }
          } else if (event.type === "done") {
            streamSettled = true;

            if (!isActive()) return;

            setRunId(event.runId);
            currentRunId = event.runId;

            const finalPanel = await pollArtifactsUntilSettled(
              event.runId,
              signal,
            );

            if (!isActive()) return;

            if (finalPanel === "unavailable") {
              setStatus("complete");
              setError((prev) => prev ?? "Artifact synthesis failed");
            } else if (finalPanel === "ready") {
              setError(null);
              setStatus((current) =>
                current === "failed" ? current : "complete",
              );
            } else if (finalPanel != null) {
              setStatus((current) =>
                current === "failed" ? current : "complete",
              );
            }

            router.replace(`/runs/${event.runId}`);
          }
        };

        const processBufferedLines = async (flush: boolean) => {
          if (flush) {
            buffer += decoder.decode(undefined, { stream: false });
          }

          const lines = buffer.split("\n");
          buffer = flush ? "" : (lines.pop() ?? "");

          for (const line of lines) {
            if (!isActive()) {
              await reader.cancel();
              return false;
            }

            const event = parseSimulationEvent(line);
            if (!event) continue;
            await handleStreamEvent(event);
          }

          return true;
        };

        try {
          while (true) {
            if (!isActive()) {
              await reader.cancel();
              return;
            }

            const { done, value } = await reader.read();

            if (!isActive()) {
              await reader.cancel();
              return;
            }

            if (value) {
              buffer += decoder.decode(value, { stream: true });
            }

            const continuing = await processBufferedLines(false);
            if (!continuing) return;

            if (done) {
              const flushed = await processBufferedLines(true);
              if (!flushed) return;
              break;
            }
          }
        } finally {
          reader.releaseLock();
        }

        if (!isActive()) return;

        if (!streamSettled) {
          setStatus("failed");
          setError("Simulation interrupted before completion");
          if (currentRunId) {
            await pollArtifactsUntilSettled(currentRunId, signal);
          } else {
            setArtifactsStatus("unavailable");
          }
        }

        setActiveAgent(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        if (!isActive()) return;

        setStatus("failed");
        setActiveAgent(null);
        setArtifactsStatus("unavailable");
        setError(err instanceof Error ? err.message : "Simulation failed");
      }
    },
    [pollArtifactsUntilSettled, router],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setActiveAgent(null);
    setArtifactsStatus("idle");
    setTeamRoster(null);
    setDebateOutcome(null);
  }, []);

  return {
    messages,
    status,
    error,
    runId,
    activeAgent,
    artifacts,
    artifactsStatus: panelArtifactsStatus,
    teamRoster,
    debateOutcome,
    start,
    cancel,
  };
}
