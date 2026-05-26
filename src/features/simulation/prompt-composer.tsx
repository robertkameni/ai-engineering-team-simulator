"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PromptComposerForm } from "@/features/simulation/prompt-composer-form";
import { useMinWidth } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

const PromptComposerMobileSheet = dynamic(
  () =>
    import("@/features/simulation/prompt-composer-mobile-sheet").then(
      (module) => module.PromptComposerMobileSheet,
    ),
  { ssr: false },
);

interface PromptComposerProps {
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSimulate?: (prompt: string) => void | Promise<void>;
}

export function PromptComposer({
  disabled = false,
  placeholder,
  className,
  defaultValue = "",
  value,
  onChange,
  onSimulate,
}: PromptComposerProps) {
  const isDesktop = useMinWidth(720);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSheetReady, setMobileSheetReady] = useState(false);

  return (
    <>
      <div
        className={cn(
          "@container/composer glass-panel hidden shrink-0 border-t-0 border-glass-border px-3 py-3 @md/composer:px-4 @md/composer:py-4 min-[720px]:block",
          className,
        )}
      >
        <div className="mx-auto max-w-3xl">
          <PromptComposerForm
            disabled={disabled}
            placeholder={placeholder}
            defaultValue={defaultValue}
            value={value}
            onChange={onChange}
            onSimulate={onSimulate}
          />
        </div>
      </div>

      {!isDesktop ? (
        <>
          <div className="pointer-events-none fixed right-4 bottom-4 z-40 max-[719px]:block min-[720px]:hidden">
            <Button
              type="button"
              size="icon"
              disabled={disabled}
              onClick={() => {
                setMobileSheetReady(true);
                setMobileOpen(true);
              }}
              className="pointer-events-auto size-12 rounded-full shadow-lg transition-transform duration-200 hover:scale-105 active:scale-95"
              aria-label="New simulation"
            >
              <Plus className="size-5" />
            </Button>
          </div>

          {mobileSheetReady ? (
            <PromptComposerMobileSheet
              open={mobileOpen}
              onOpenChange={setMobileOpen}
              disabled={disabled}
              placeholder={placeholder}
              defaultValue={defaultValue}
              value={value}
              onChange={onChange}
              onSimulate={onSimulate}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
