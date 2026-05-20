"use client";

import { Menu, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSavedRunMobile } from "@/features/workspace/saved-run-mobile-context";

interface SavedRunMobileActionsProps {
  showArtifactsAction: boolean;
}

export function SavedRunMobileActions({
  showArtifactsAction,
}: SavedRunMobileActionsProps) {
  const mobile = useSavedRunMobile();

  if (!mobile) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 max-[719px]:inline-flex min-[720px]:hidden"
        onClick={mobile.openSidebar}
        aria-label="Open menu"
      >
        <Menu className="size-4" />
      </Button>
      {showArtifactsAction ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="glass-card size-8 border-glass-border max-[959px]:inline-flex min-[960px]:hidden"
          onClick={mobile.openArtifacts}
          aria-label="Expand artifacts"
          title="Expand artifacts"
        >
          <Layers className="size-4" />
        </Button>
      ) : null}
    </>
  );
}
