"use client";

import { useCallback, useRef, useState } from "react";

import type { RunStatus, SimulationMessage } from "@/features/agents/types";
import { parseSimulationEvent } from "@/lib/simulation-stream";

function formatMessageTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function useSimulationStream() {
  const [messages, setMessages] = useState<SimulationMessage[]>([]);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeMessageIdRef = useRef<string | null>(null);

  const start = useCallback(async (prompt: string) => {
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    setStatus("running");
    setError(null);
    setMessages([]);
    activeMessageIdRef.current = null;

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
        throw new Error(payload?.error ?? `Request failed (${response.status})`);
      }

      if (!response.body) {
        throw new Error("No response stream");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const event = parseSimulationEvent(line);
          if (!event) continue;

          if (event.type === "agent_start") {
            const id = crypto.randomUUID();
            activeMessageIdRef.current = id;
            setMessages((prev) => [
              ...prev,
              {
                id,
                role: event.role,
                content: "",
                isStreaming: true,
                createdAt: formatMessageTime(),
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
            if (!activeId) continue;
            setMessages((prev) =>
              prev.map((message) =>
                message.id === activeId
                  ? { ...message, isStreaming: false }
                  : message,
              ),
            );
            activeMessageIdRef.current = null;
          } else if (event.type === "error") {
            setError(event.message);
            setStatus("failed");
          } else if (event.type === "done") {
            setStatus((current) =>
              current === "failed" ? current : "complete",
            );
          }
        }
      }

      setStatus((current) => (current === "running" ? "complete" : current));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setStatus("failed");
      setError(err instanceof Error ? err.message : "Simulation failed");
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
  }, []);

  return { messages, status, error, start, cancel };
}
