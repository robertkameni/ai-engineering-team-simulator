"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import type { ArtifactsPanelStatus, PartialRunArtifacts } from "@/features/artifacts/types";
import type { AgentRole, RunStatus, SimulationMessage } from "@/features/agents/types";
import { parseSimulationEvent } from "@/lib/simulation-stream";
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
    }
  | { ok: false; retryable: boolean };

function isRetryableArtifactsHttpStatus(status: number): boolean {
  return status === 404 || status === 408 || status === 429 || status >= 500;
}

async function fetchArtifactsState(id: string): Promise<ArtifactsFetchResult> {
  let response: Response;
  try {
    response = await fetch(`/api/runs/${id}/artifacts`);
  } catch {
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
  };

  return {
    ok: true,
    artifacts: data.artifacts,
    status: data.status,
  };
}

function waitForArtifactPoll(): Promise<void> {
  return new Promise((resolve) =>
    globalThis.setTimeout(resolve, POLL_ARTIFACT_INTERVAL_MS),
  );
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
  const abortRef = useRef<AbortController | null>(null);
  const activeMessageIdRef = useRef<string | null>(null);

  const panelArtifactsStatus = artifactsStatus;

  const loadArtifacts = useCallback(async (id: string) => {
    const deadline = Date.now() + POLL_ARTIFACT_MAX_MS;
    while (Date.now() < deadline) {
      const result = await fetchArtifactsState(id);
      if (result.ok) {
        setArtifacts(result.artifacts);
        setArtifactsStatus(result.status);
        return;
      }
      if (!result.retryable) {
        setArtifactsStatus("unavailable");
        return;
      }
      await waitForArtifactPoll();
    }
    setArtifactsStatus("unavailable");
  }, []);

  const pollArtifactsUntilSettled = useCallback(
    async (id: string): Promise<ArtifactsPanelStatus> => {
      const deadline = Date.now() + POLL_ARTIFACT_MAX_MS;
      while (Date.now() < deadline) {
        const result = await fetchArtifactsState(id);

        if (!result.ok) {
          if (result.retryable) {
            await waitForArtifactPoll();
            continue;
          }
          setArtifactsStatus("unavailable");
          return "unavailable";
        }

        setArtifacts(result.artifacts);
        setArtifactsStatus(result.status);

        if (result.status === "ready" || result.status === "unavailable") {
          return result.status;
        }

        await waitForArtifactPoll();
      }

      const finalResult = await fetchArtifactsState(id);
      if (finalResult.ok) {
        setArtifacts(finalResult.artifacts);
        setArtifactsStatus(finalResult.status);
        return finalResult.status;
      }

      setArtifactsStatus("unavailable");
      return "unavailable";
    },
    [],
  );

  const start = useCallback(
    async (prompt: string) => {
      abortRef.current?.abort();
      const abortController = new AbortController();
      abortRef.current = abortController;

      setStatus("running");
      setError(null);
      setMessages([]);
      setRunId(null);
      setActiveAgent(null);
      setArtifacts(null);
      setArtifactsStatus("pending");
      setTeamRoster(null);
      activeMessageIdRef.current = null;
      let currentRunId: string | null = null;

      try {
        const response = await fetch("/api/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(
            payload?.error ?? `Request failed (${response.status})`,
          );
        }

        if (!response.body) {
          throw new Error("No response stream");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamSettled = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const event = parseSimulationEvent(line);
            if (!event) continue;

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
                  createdAt: formatMessageTime(new Date()),
                },
              ]);
            } else if (event.type === "text-delta") {
              const activeId = activeMessageIdRef.current;
              
              if (!activeId) continue;
              
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
                      ? { ...message, isStreaming: false }
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
              
              if (currentRunId) {
                await loadArtifacts(currentRunId);
              } else {
                setArtifactsStatus("unavailable");
              }
            } else if (event.type === "done") {
              streamSettled = true;
              setRunId(event.runId);
              currentRunId = event.runId;

              const finalPanel = await pollArtifactsUntilSettled(event.runId);
              
              if (finalPanel === "unavailable") {
                setStatus("complete");
                setError((prev) => prev ?? "Artifact synthesis failed");
              } else {
                setStatus((current) =>
                  current === "failed" ? current : "complete",
                );
              }

              router.replace(`/runs/${event.runId}`);
            }
          }
        }

        if (!streamSettled) {
          setStatus("failed");
          setError("Simulation interrupted before completion");
          setArtifactsStatus("unavailable");
          if (currentRunId) {
            await loadArtifacts(currentRunId);
          }
        }

        setActiveAgent(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setStatus("failed");
        setActiveAgent(null);
        setArtifactsStatus("unavailable");
        setError(err instanceof Error ? err.message : "Simulation failed");
      }
    },
    [loadArtifacts, pollArtifactsUntilSettled, router],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setActiveAgent(null);
    setArtifactsStatus("idle");
    setTeamRoster(null);
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
    start,
    cancel,
  };
}
