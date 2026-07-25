"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Plus, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PromptComposerForm } from "@/features/simulation/prompt-composer-form";
import type {
  PromptComposerProps,
  PromptComposerFabProps,
  PromptComposerRunSession,
} from "@/features/simulation/prompt-composer-types";
import { useMinWidth } from "@/hooks/use-media-query";
import { hasWorkspacePrompt } from "@/lib/workspace-url";
import { cn } from "@/lib/utils";

const PromptComposerMobileSheet = dynamic(
  () =>
    import("@/features/simulation/prompt-composer-mobile-sheet").then(
      (module) => module.PromptComposerMobileSheet,
    ),
  { ssr: false },
);

function resolveDerivedState(
  value: string | undefined,
  defaultValue: string,
  disabled: boolean,
  onSimulate: ((prompt: string) => void | Promise<void>) | undefined,
  runSession: PromptComposerRunSession | null | undefined,
) {
  const text = value ?? defaultValue;
  const hasPrompt =
    hasWorkspacePrompt(text) ||
    (runSession != null && hasWorkspacePrompt(runSession.currentPrompt));
  const isLiveWorkspace = onSimulate != null && hasPrompt;
  const canRerun =
    isLiveWorkspace &&
    !disabled &&
    hasWorkspacePrompt(text) &&
    (runSession == null || runSession.canRerun);

  return {
    text,
    isLiveWorkspace,
    canRerun,
    sheetTitle: isLiveWorkspace ? "Rerun simulation" : "New simulation",
    sheetDescription: isLiveWorkspace
      ? "Edit your product idea, then rerun the simulation."
      : "Describe what you want the team to build.",
    mobileAriaLabel: isLiveWorkspace
      ? disabled
        ? "Simulation running"
        : "Edit and rerun simulation"
      : "New simulation",
    mobileIcon: isLiveWorkspace ? (
      <RotateCw className="size-5" />
    ) : (
      <Plus className="size-5" />
    ),
  };
}

function PromptComposerFab({
  disabled,
  ariaLabel,
  icon,
  onClick,
}: PromptComposerFabProps) {
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-40 max-[719px]:block min-[720px]:hidden">
      <Button
        type="button"
        size="icon"
        disabled={disabled}
        onClick={onClick}
        aria-label={ariaLabel}
        className="pointer-events-auto size-12 rounded-full shadow-lg transition-transform duration-200 hover:scale-105 active:scale-95"
      >
        {icon}
      </Button>
    </div>
  );
}

export function PromptComposer({
  disabled = false,
  placeholder,
  className,
  defaultValue = "",
  value,
  onChange,
  onSimulate,
  runSession = null,
}: PromptComposerProps) {
  const isDesktop = useMinWidth(720);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSheetReady, setMobileSheetReady] = useState(false);

  const derived = useMemo(
    () =>
      resolveDerivedState(
        value,
        defaultValue,
        disabled,
        onSimulate,
        runSession,
      ),
    [value, defaultValue, disabled, onSimulate, runSession],
  );

  const handleRerun = useCallback(
    (promptOverride?: string) => {
      const trimmed = (promptOverride ?? derived.text).trim();
      if (!trimmed) return;

      if (runSession != null && runSession.canRerun) {
        runSession.onRerun(trimmed);
        return;
      }

      onSimulate?.(trimmed);
    },
    [derived.text, onSimulate, runSession],
  );

  const handleMobileOpen = useCallback(() => {
    setMobileSheetReady(true);
    setMobileOpen(true);
  }, []);

  const mobileOnSimulate = derived.isLiveWorkspace
    ? (prompt: string) => handleRerun(prompt)
    : onSimulate;

  return (
    <>
      <div
        className={cn(
          "@container/composer glass-panel hidden shrink-0 border-t-0 border-glass-border px-3 py-3 @md/composer:px-4 @md/composer:py-4 min-[720px]:block",
          className,
        )}
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          <PromptComposerForm
            disabled={disabled}
            placeholder={placeholder}
            defaultValue={defaultValue}
            value={value}
            onChange={onChange}
            onSimulate={onSimulate}
            isRerunMode={derived.isLiveWorkspace}
          />
          {derived.isLiveWorkspace && (
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              disabled={!derived.canRerun}
              onClick={() => handleRerun()}
            >
              <RotateCw className="size-4" />
              {disabled ? "Simulation running…" : "Rerun simulation"}
            </Button>
          )}
        </div>
      </div>

      {!isDesktop && (
        <>
          <PromptComposerFab
            disabled={disabled && !derived.isLiveWorkspace}
            ariaLabel={derived.mobileAriaLabel}
            icon={derived.mobileIcon}
            onClick={handleMobileOpen}
          />

          {mobileSheetReady && (
            <PromptComposerMobileSheet
              open={mobileOpen}
              onOpenChange={setMobileOpen}
              disabled={disabled}
              placeholder={placeholder}
              defaultValue={defaultValue}
              value={value}
              onChange={onChange}
              onSimulate={mobileOnSimulate}
              title={derived.sheetTitle}
              description={derived.sheetDescription}
              isRerunMode={derived.isLiveWorkspace}
            />
          )}
        </>
      )}
    </>
  );
}
