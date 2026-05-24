"use client";

import { cn } from "@/lib/utils";

interface ExamplePromptChipsProps {
  prompts: string[];
  onSelect: (prompt: string) => void;
  className?: string;
}

export function ExamplePromptChips({
  prompts,
  onSelect,
  className,
}: ExamplePromptChipsProps) {
  return (
    <div className={cn("flex flex-wrap justify-center gap-2", className)}>
      {prompts.map((prompt, index) => (
        <button
          key={`${index}-${prompt}`}
          type="button"
          onClick={() => onSelect(prompt)}
          className="cursor-pointer rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-accent hover:text-foreground"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
