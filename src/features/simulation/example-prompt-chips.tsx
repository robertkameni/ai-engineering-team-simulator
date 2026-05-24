"use client";

import { cn } from "@/lib/utils";

interface ExamplePromptChipsProps {
  prompts: string[];
  onSelect: (prompt: string) => void;
  className?: string;
  staggerEnter?: boolean;
}

export function ExamplePromptChips({
  prompts,
  onSelect,
  className,
  staggerEnter = false,
}: ExamplePromptChipsProps) {
  return (
    <div className={cn("flex flex-wrap justify-center gap-2", className)}>
      {prompts.map((prompt, index) => (
        <button
          key={`${index}-${prompt}`}
          type="button"
          onClick={() => onSelect(prompt)}
          className={cn(
            "cursor-pointer rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted-foreground transition-all duration-200 hover:scale-[1.03] hover:border-foreground/20 hover:bg-accent hover:text-foreground active:scale-[0.98]",
            staggerEnter && "landing-rise",
            staggerEnter && index === 0 && "landing-delay-4",
            staggerEnter && index === 1 && "landing-delay-5",
            staggerEnter && index === 2 && "landing-delay-6",
          )}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
