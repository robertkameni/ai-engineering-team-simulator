"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import type {
  AgentRole,
  ArtifactsPanelStatus,
  DebateExitOutcome,
  PartialRunArtifacts,
  RunStatus,
  SimulationMessage,
} from "@/lib/types";
import { parseSimulationEvent } from "@/lib/simulation-stream";
import type { TeamRosterPreview } from "@/lib/team-roster-preview";

import { createSimulationStreamEventHandler } from "./simulation-stream-events";
import {
  formatSimulationStreamError,
  recoverRunAfterStreamDrop,
} from "./simulation-stream-polling";

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
  const [stackValidationFailed, setStackValidationFailed] = useState(false);
  const [crossValidationFailed, setCrossValidationFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const activeMessageIdRef = useRef<string | null>(null);

  const panelArtifactsStatus = artifactsStatus;

  const recoverAfterDrop = useCallback(
    (id: string, signal?: AbortSignal) =>
      recoverRunAfterStreamDrop(
        id,
        {
          setArtifacts,
          setArtifactsStatus,
          setDebateOutcome,
          setStackValidationFailed,
          setCrossValidationFailed,
          setStatus,
          setError,
          setActiveAgent,
          setRunId,
          setMessages,
          setTeamRoster,
        },
        (completedRunId) => router.replace(`/runs/${completedRunId}`),
        signal,
      ),
    [
      router,
      setArtifacts,
      setArtifactsStatus,
      setDebateOutcome,
      setStackValidationFailed,
      setCrossValidationFailed,
      setStatus,
      setError,
      setActiveAgent,
      setRunId,
      setMessages,
      setTeamRoster,
    ],
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
        setStackValidationFailed(false);
        setCrossValidationFailed(false);
      }
      activeMessageIdRef.current = null;

      const currentRunIdRef = { current: null as string | null };
      const streamSettledRef = { current: false };
      const artifactsSettledViaStreamRef = { current: false };

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
          const base = errorText ?? `Request failed (${response.status})`;
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

        const streamEventHandler = createSimulationStreamEventHandler({
          signal,
          isActive,
          currentRunIdRef,
          activeMessageIdRef,
          streamSettledRef,
          artifactsSettledViaStreamRef,
          setRunId,
          setStatus,
          setError,
          setActiveAgent,
          setMessages,
          setTeamRoster,
          setArtifactsStatus,
          setArtifacts,
          setDebateOutcome,
          setStackValidationFailed,
          setCrossValidationFailed,
          router,
        });

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
            await streamEventHandler.handle(event);
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
          // Arch-review F1: flush coalesced deltas before tear-down so last tokens render.
          streamEventHandler.flushPendingTextDeltas();
          streamEventHandler.dispose();
          reader.releaseLock();
        }

        if (!isActive()) return;

        if (!streamSettledRef.current) {
          if (currentRunIdRef.current) {
            await recoverAfterDrop(currentRunIdRef.current, signal);
          } else {
            setStatus("failed");
            setError("Simulation interrupted before completion");
            setArtifactsStatus("unavailable");
          }
        }

        setActiveAgent(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        if (!isActive()) return;

        if (currentRunIdRef.current) {
          await recoverAfterDrop(currentRunIdRef.current, signal);
          return;
        }

        setStatus("failed");
        setActiveAgent(null);
        setArtifactsStatus("unavailable");
        setError(formatSimulationStreamError(err));
      }
    },
    [recoverAfterDrop, router],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setActiveAgent(null);
    setArtifactsStatus("idle");
    setTeamRoster(null);
    setDebateOutcome(null);
    setStackValidationFailed(false);
    setCrossValidationFailed(false);
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
    stackValidationFailed,
    crossValidationFailed,
    start,
    cancel,
  };
}
