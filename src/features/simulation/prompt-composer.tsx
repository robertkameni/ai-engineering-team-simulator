"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface PromptComposerProps {
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  defaultValue?: string;
  /** When set, runs live simulation instead of navigating with ?prompt= */
  onSimulate?: (prompt: string) => void | Promise<void>;
}

export function PromptComposer({
  disabled = false,
  placeholder = "Build a food delivery app for students on campus…",
  className,
  defaultValue = "",
  onSimulate,
}: PromptComposerProps) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    if (onSimulate) {
      await onSimulate(trimmed);
      return;
    }

    router.push(`/workspace?prompt=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "border-t border-border bg-background px-4 py-4",
        className,
      )}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        <label htmlFor="workspace-prompt" className="sr-only">
          Product idea
        </label>
        <div className="relative rounded-lg border border-input bg-surface-2 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
          <Textarea
            id="workspace-prompt"
            name="prompt"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            disabled={disabled}
            placeholder={placeholder}
            rows={3}
            className="min-h-[88px] resize-none border-0 bg-transparent pr-12 shadow-none focus-visible:ring-0"
          />
          <div className="absolute right-2 bottom-2">
            <Button
              type="submit"
              size="icon"
              disabled={disabled || !value.trim()}
              className="size-8 rounded-md"
              aria-label={onSimulate ? "Run simulation" : "Start simulation"}
            >
              <ArrowUp />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {disabled
            ? "Team is discussing…"
            : onSimulate
              ? "Press ⌘ Enter to run again"
              : "Press ⌘ Enter to start the simulation"}
        </p>
      </div>
    </form>
  );
}
