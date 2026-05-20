"use client";

import { useEffect, useRef } from "react";
import { Users } from "lucide-react";

import { AgentMessage } from "@/features/simulation/agent-message";
import { MessageThreadSkeleton } from "@/features/simulation/message-thread-skeleton";
import type { SimulationMessage } from "@/features/agents/types";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MessageThreadProps {
  messages: SimulationMessage[];
  empty?: boolean;
  loading?: boolean;
}

export function MessageThread({ messages, empty, loading }: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMessageKey = messages.at(-1)?.id;
  const lastContentLength = messages.at(-1)?.content.length ?? 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lastMessageKey, lastContentLength, messages.length]);

  if (loading) {
    return (
      <ScrollArea className="@container/message-thread min-h-0 flex-1">
        <MessageThreadSkeleton />
      </ScrollArea>
    );
  }

  if (empty) {
    return (
      <div className="@container/message-thread flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8 text-center @[720px]/app-shell:px-6">
        <div className="glass-card mb-3 flex size-12 items-center justify-center rounded-2xl @[720px]/app-shell:mb-4 @[720px]/app-shell:size-14">
          <Users className="size-5 text-agent-architect @[720px]/app-shell:size-6" />
        </div>
        <h2 className="text-body font-semibold tracking-tight text-foreground @[720px]/app-shell:text-title">
          Describe what you want to build
        </h2>
        <p className="mt-2 max-w-md text-caption text-muted-foreground @[720px]/app-shell:text-body">
          Tap <span className="font-medium text-foreground">+</span> to start a
          simulation. Your team will debate requirements, architecture, and
          tradeoffs live.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="@container/message-thread min-h-0 flex-1 pb-16 @[720px]/app-shell:pb-0">
      <div
        className="flex flex-col gap-4 px-3 py-3 @md/message-thread:gap-8 @md/message-thread:px-4 @md/message-thread:py-4"
        aria-label="Engineering team discussion"
        aria-live="polite"
        aria-busy={messages.some((message) => message.isStreaming)}
      >
        {messages.map((message) => (
          <AgentMessage key={message.id} message={message} />
        ))}
        <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
      </div>
    </ScrollArea>
  );
}
