"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

import { LandingLiveDebate } from "@/features/landing/landing-live-debate";
import { LandingPromptForm } from "@/features/landing/landing-prompt-form";

export function LandingHero() {
  const pathname = usePathname();
  const previousPathRef = useRef<string | null>(null);
  const [motionKey, setMotionKey] = useState(0);

  useEffect(() => {
    if (
      pathname === "/" &&
      previousPathRef.current !== null &&
      previousPathRef.current !== "/"
    ) {
      setMotionKey((key) => key + 1);
    }
    previousPathRef.current = pathname;
  }, [pathname]);

  return (
    <main
      key={motionKey}
      className="relative z-10 flex w-full max-w-2xl flex-col items-center text-center"
    >
      <div className="landing-rise landing-delay-0 glass-card mt-4 mb-6 flex items-center gap-2 rounded-full px-4 py-1.5 text-caption text-muted-foreground">
        <span className="landing-live-dot" aria-hidden />
        <Sparkles className="size-3.5 text-agent-pm pulse-glow" />
        Multi-agent engineering simulator
      </div>

      <h1 className="landing-rise landing-delay-1 text-display font-semibold tracking-tight text-balance text-foreground">
        Your AI engineering team,
        <span className="landing-shimmer-text mt-1 block">
          debating your idea live
        </span>
      </h1>

      <p className="landing-rise landing-delay-2 mt-4 max-w-lg text-pretty text-body leading-relaxed text-muted-foreground">
        Describe any project — software, physical, or hybrid. A PM, architect,
        developers, and reviewer debate it out loud, challenge weak assumptions,
        and deliver structured artifacts when the thread ends.
      </p>

      <LandingLiveDebate />

      <LandingPromptForm staggerExampleChips />

      <Link
        href="/workspace"
        className="landing-rise landing-delay-7 mt-8 mb-4 text-caption text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        Open workspace →
      </Link>
    </main>
  );
}
