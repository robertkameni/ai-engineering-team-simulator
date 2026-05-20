"use client";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ArtifactPanel } from "@/features/artifacts/artifact-panel";
import type { ArtifactsPanelStatus, RunArtifacts } from "@/features/artifacts/types";

interface ArtifactsMobileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artifacts?: RunArtifacts | null;
  status?: ArtifactsPanelStatus;
  onRegenerateArtifacts?: () => void | Promise<void>;
  canRegenerateArtifacts?: boolean;
  isRegeneratingArtifacts?: boolean;
}

export function ArtifactsMobileSheet({
  open,
  onOpenChange,
  artifacts = null,
  status = "idle",
  onRegenerateArtifacts,
  canRegenerateArtifacts = false,
  isRegeneratingArtifacts = false,
}: ArtifactsMobileSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showClose={false}
        className="glass-panel h-[min(88svh,720px)] gap-0 border-glass-border p-0"
      >
        <SheetTitle className="sr-only">Artifacts</SheetTitle>
        <SheetDescription className="sr-only">
          Structured outputs from the team debate
        </SheetDescription>
        <ArtifactPanel
          artifacts={artifacts}
          status={status}
          layout="sheet"
          onRegenerateArtifacts={onRegenerateArtifacts}
          canRegenerateArtifacts={canRegenerateArtifacts}
          isRegeneratingArtifacts={isRegeneratingArtifacts}
        />
      </SheetContent>
    </Sheet>
  );
}
