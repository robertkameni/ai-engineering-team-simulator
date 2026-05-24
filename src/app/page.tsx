import Link from "next/link";
import { Sparkles } from "lucide-react";
import { pickRandomExamplePrompts } from "@/features/landing/example-prompts";
import { LandingPromptForm } from "@/features/landing/landing-prompt-form";

export default function HomePage() {
  const examplePrompts = pickRandomExamplePrompts(3);

  return (
    <div className="@container/landing relative flex min-h-svh flex-col items-center justify-center overflow-hidden ambient-mesh px-4">
      <main className="relative z-10 flex w-full max-w-2xl flex-col items-center text-center">
        <div className="glass-card mb-6 flex items-center gap-2 rounded-full px-4 py-1.5 text-caption text-muted-foreground message-enter">
          <Sparkles className="size-3.5 text-agent-pm" />
          Multi-agent engineering simulator
        </div>

        <h1 className="text-display font-semibold tracking-tight text-balance text-foreground message-enter">
          Your AI engineering team,
          <span className="mt-1 block text-muted-foreground">
            debating in real time
          </span>
        </h1>

        <p className="mt-4 max-w-lg text-pretty text-body leading-relaxed text-muted-foreground message-enter">
          PM, architect, backend & frontend developers, and reviewer collaborate
          on your product idea — challenging assumptions, not just agreeing.
        </p>

        <LandingPromptForm examplePrompts={examplePrompts} />

        <Link
          href="/workspace"
          className="mt-8 text-caption text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Open workspace →
        </Link>
      </main>
    </div>
  );
}
