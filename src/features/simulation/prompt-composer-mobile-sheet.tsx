"use client";

import { OpenInForgeButton } from "@/components/open-in-forge-button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PromptComposerForm } from "./prompt-composer-form";

interface PromptComposerMobileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSimulate?: (prompt: string) => void | Promise<void>;
  title?: string;
  description?: string;
  isRerunMode?: boolean;
  runId?: string | null;
  isAuthenticated?: boolean;
}

export function PromptComposerMobileSheet({
  open,
  onOpenChange,
  disabled,
  placeholder,
  defaultValue,
  value,
  onChange,
  onSimulate,
  title = "New simulation",
  description = "Describe what you want the team to build.",
  isRerunMode = false,
  runId = null,
  isAuthenticated = false,
}: PromptComposerMobileSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="glass-panel gap-0 border-glass-border px-4 pt-4 pb-6"
      >
        <SheetHeader className="px-0 pb-3 text-left">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <PromptComposerForm
          disabled={disabled}
          placeholder={placeholder}
          defaultValue={defaultValue}
          value={value}
          onChange={onChange}
          onSimulate={onSimulate}
          onSubmitted={() => onOpenChange(false)}
          idPrefix="mobile-workspace"
          isRerunMode={isRerunMode}
        />
        {runId ? (
          <OpenInForgeButton
            runId={runId}
            isAuthenticated={isAuthenticated}
            disabled={disabled}
            className="mt-3 w-full"
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
