"use client";

import { useEffect, useState } from "react";

import { AgentAvatar } from "@/components/agents/agent-avatar";
import { getPersona } from "@/lib/agents/personas";
import { LANDING_DEBATE_SNIPPETS } from "@/features/landing/landing-content";
import { cn } from "@/lib/utils";

const TICK_MS = 3_800;

export function LandingLiveDebate({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      setIndex((current) => (current + 1) % LANDING_DEBATE_SNIPPETS.length);
    }, TICK_MS);
    return () => globalThis.clearInterval(timer);
  }, []);

  const snippet = LANDING_DEBATE_SNIPPETS[index]!;
  const persona = getPersona(snippet.role);

  return (
    <div
      className={cn(
        "landing-rise landing-delay-25 mt-5 w-full max-w-md",
        className,
      )}
      aria-live="polite"
      aria-atomic
    >
      <div className="glass-card overflow-hidden rounded-xl border border-glass-border px-3 py-3 text-left shadow-[0_0_32px_oklch(0.68_0.17_255/8%)]">
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <span className="landing-live-dot" aria-hidden />
          Live team debate
        </p>
        <div key={index} className="landing-debate-tick flex items-start gap-2.5">
          <AgentAvatar role={snippet.role} className="size-8 text-[10px]" />
          <div className="min-w-0 flex-1">
            <span
              className={cn(
                "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                persona.badgeClass,
              )}
            >
              {persona.title}
            </span>
            <p className="mt-1.5 text-pretty text-sm leading-snug text-foreground/90">
              {snippet.text}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
