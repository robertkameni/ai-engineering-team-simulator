"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import { ExamplePromptChips } from "@/components/example-prompt-chips";
import { useExamplePromptChips } from "@/features/landing/use-example-prompt-chips";
import { useRotatingPlaceholder } from "@/features/landing/use-rotating-placeholder";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  isSubmitShortcut,
  useSubmitShortcutLabel,
} from "@/lib/submit-shortcut";

interface LandingPromptFormProps {
  staggerExampleChips?: boolean;
}

export function LandingPromptForm({
  staggerExampleChips = false,
}: LandingPromptFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const shortcutLabel = useSubmitShortcutLabel();
  const rotatingPlaceholder = useRotatingPlaceholder();
  const examplePrompts = useExamplePromptChips();

  return (
    <>
      <form
        ref={formRef}
        action="/workspace"
        method="get"
        className="landing-rise landing-delay-3 mt-10 w-full rounded-2xl glass-input p-2 shadow-lg transition-all duration-300 focus-within:ring-2 focus-within:ring-ring/30 focus-within:shadow-[0_0_40px_oklch(0.68_0.17_255/12%)]"
      >
        <label htmlFor="landing-prompt" className="sr-only">
          Product idea
        </label>
        <Textarea
          id="landing-prompt"
          name="prompt"
          required
          placeholder={rotatingPlaceholder}
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
          <Button
            type="submit"
            className="gap-2 transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            Start simulation
            <ArrowRight />
          </Button>
        </div>
      </form>

      <ExamplePromptChips
        prompts={examplePrompts}
        staggerEnter={staggerExampleChips}
        onSelect={(value) => {
          router.push(`/workspace?prompt=${encodeURIComponent(value)}`);
        }}
        className="mt-6"
      />
    </>
  );
}
