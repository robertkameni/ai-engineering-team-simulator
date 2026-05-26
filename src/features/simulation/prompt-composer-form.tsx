"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  isSubmitShortcut,
  useSubmitShortcutLabel,
} from "@/lib/submit-shortcut";

export interface PromptComposerFormProps {
  disabled?: boolean;
  placeholder?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSimulate?: (prompt: string) => void | Promise<void>;
  onSubmitted?: () => void;
  showHint?: boolean;
  idPrefix?: string;
}

export function PromptComposerForm({
  disabled = false,
  placeholder = "Describe your product idea…",
  defaultValue = "",
  value,
  onChange,
  onSimulate,
  onSubmitted,
  showHint = true,
  idPrefix = "workspace",
}: PromptComposerFormProps) {
  const router = useRouter();
  const [internalValue, setInternalValue] = useState(defaultValue);
  const text = value ?? internalValue;
  const shortcutLabel = useSubmitShortcutLabel();

  function handleTextChange(nextText: string) {
    onChange?.(nextText);
    if (value === undefined) {
      setInternalValue(nextText);
    }
  }

  const submitPrompt = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed || disabled) return;

      if (onSimulate) {
        await onSimulate(trimmed);
        onSubmitted?.();
        return;
      }

      onSubmitted?.();
      router.push(`/workspace?prompt=${encodeURIComponent(trimmed)}`);
    },
    [disabled, onSimulate, onSubmitted, router],
  );

  async function handleAction(formData: FormData) {
    await submitPrompt(String(formData.get("prompt") ?? ""));
  }

  const textareaId = `${idPrefix}-prompt`;

  return (
    <form action={handleAction} className="flex flex-col gap-2">
      <label htmlFor={textareaId} className="sr-only">
        Product idea
      </label>
      <div className="glass-input relative rounded-xl transition-all duration-200 focus-within:ring-2 focus-within:ring-ring/30">
        <Textarea
          id={textareaId}
          name="prompt"
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={(event) => {
            if (!isSubmitShortcut(event)) return;
            event.preventDefault();
            void submitPrompt(text);
          }}
          disabled={disabled}
          placeholder={placeholder}
          rows={3}
          className="min-h-[80px] resize-none border-0 bg-transparent pr-12 text-body shadow-none focus-visible:ring-0 @md/composer:min-h-[88px]"
        />
        <div className="absolute right-2 bottom-2">
          <Button
            type="submit"
            size="icon"
            disabled={disabled || !text.trim()}
            className="size-8 rounded-lg transition-transform duration-200 hover:scale-105 active:scale-95"
            aria-label={onSimulate ? "Run simulation" : "Start simulation"}
          >
            <ArrowUp />
          </Button>
        </div>
      </div>
      {showHint ? (
        <p className="text-caption text-muted-foreground" aria-live="polite">
          {disabled
            ? "Team is discussing…"
            : onSimulate
              ? `Press ${shortcutLabel} to run again`
              : `Press ${shortcutLabel} to start the simulation`}
        </p>
      ) : null}
    </form>
  );
}
