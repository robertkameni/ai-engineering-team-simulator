"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import { ExamplePromptChips } from "@/features/simulation/example-prompt-chips";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  isSubmitShortcut,
  useSubmitShortcutLabel,
} from "@/lib/submit-shortcut";

interface LandingPromptFormProps {
  examplePrompts: string[];
}

export function LandingPromptForm({ examplePrompts }: LandingPromptFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const shortcutLabel = useSubmitShortcutLabel();

  return (
    <>
      <form
        ref={formRef}
        action="/workspace"
        method="get"
        className="mt-10 w-full rounded-2xl glass-input p-2 shadow-lg transition-all duration-300 focus-within:ring-2 focus-within:ring-ring/30"
      >
        <label htmlFor="landing-prompt" className="sr-only">
          Product idea
        </label>
        <Textarea
          id="landing-prompt"
          name="prompt"
          required
          placeholder="e.g. A food donation app for a church community…"
          rows={4}
          className="min-h-[120px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          onKeyDown={(event) => {
            if (!isSubmitShortcut(event)) return;
            event.preventDefault();
            formRef.current?.requestSubmit();
          }}
        />
        <div className="flex items-center justify-between gap-2 px-1 pb-1">
          <p className="text-xs text-muted-foreground">
            {shortcutLabel} to start
          </p>
          <Button type="submit" className="gap-2">
            Start simulation
            <ArrowRight />
          </Button>
        </div>
      </form>

      <ExamplePromptChips
        prompts={examplePrompts}
        onSelect={(value) => {
          router.push(`/workspace?prompt=${encodeURIComponent(value)}`);
        }}
        className="mt-6"
      />
    </>
  );
}
