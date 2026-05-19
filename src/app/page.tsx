import Link from "next/link";
import { Sparkles } from "lucide-react";

import { LandingPromptForm } from "@/features/landing/landing-prompt-form";

export default function HomePage() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-background px-4">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-zinc-800/40 via-background to-background"
        aria-hidden
      />

      <main className="relative z-10 flex w-full max-w-2xl flex-col items-center text-center">
        <div className="mb-6 flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="size-3.5" />
          Multi-agent engineering simulator
        </div>

        <h1 className="text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
          Your AI engineering team,
          <span className="block text-muted-foreground">
            debating in real time
          </span>
        </h1>

        <p className="mt-4 max-w-lg text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
          PM, architect, and reviewer agents collaborate on your product idea —
          challenging assumptions, not just agreeing.
        </p>

        <LandingPromptForm />

        <Link
          href="/workspace"
          className="mt-8 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          View demo workspace with sample debate →
        </Link>
      </main>
    </div>
  );
}
