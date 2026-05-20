"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  isSubmitShortcut,
  useSubmitShortcutLabel,
} from "@/lib/submit-shortcut";
import { cn } from "@/lib/utils";

interface PromptComposerProps {
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  defaultValue?: string;
  onSimulate?: (prompt: string) => void | Promise<void>;
}

interface PromptComposerFormProps {
  disabled?: boolean;
  placeholder?: string;
  defaultValue?: string;
  onSimulate?: (prompt: string) => void | Promise<void>;
  onSubmitted?: () => void;
  showHint?: boolean;
  idPrefix?: string;
}

function PromptComposerForm({
  disabled = false,
  placeholder = "Describe your product idea…",
  defaultValue = "",
  onSimulate,
  onSubmitted,
  showHint = true,
  idPrefix = "workspace",
}: PromptComposerFormProps) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const shortcutLabel = useSubmitShortcutLabel();

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
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(event) => {
            if (!isSubmitShortcut(event)) return;
            event.preventDefault();
            void submitPrompt(value);
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
            disabled={disabled || !value.trim()}
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

export function PromptComposer({
  disabled = false,
  placeholder,
  className,
  defaultValue = "",
  onSimulate,
}: PromptComposerProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <div
        className={cn(
          "@container/composer glass-panel hidden shrink-0 border-t-0 border-glass-border px-3 py-3 @md/composer:px-4 @md/composer:py-4 @[720px]/app-shell:block",
          className,
        )}
      >
        <div className="mx-auto max-w-3xl">
          <PromptComposerForm
            disabled={disabled}
            placeholder={placeholder}
            defaultValue={defaultValue}
            onSimulate={onSimulate}
          />
        </div>
      </div>

      <div className="pointer-events-none fixed right-4 bottom-4 z-40 @[720px]/app-shell:hidden">
        <Button
          type="button"
          size="icon"
          disabled={disabled}
          onClick={() => setMobileOpen(true)}
          className="pointer-events-auto size-12 rounded-full shadow-lg transition-transform duration-200 hover:scale-105 active:scale-95"
          aria-label="New simulation"
        >
          <Plus className="size-5" />
        </Button>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="bottom"
          className="glass-panel gap-0 border-glass-border px-4 pt-4 pb-6"
        >
          <SheetHeader className="px-0 pb-3 text-left">
            <SheetTitle>New simulation</SheetTitle>
            <SheetDescription>
              Describe what you want the team to build.
            </SheetDescription>
          </SheetHeader>
          <PromptComposerForm
            disabled={disabled}
            placeholder={placeholder}
            defaultValue={defaultValue}
            onSimulate={onSimulate}
            onSubmitted={() => setMobileOpen(false)}
            idPrefix="mobile-workspace"
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
