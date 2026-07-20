import type { ReactNode } from "react";

import { RegenerateArtifactsButton } from "@/features/artifacts/regenerate-artifacts-button";
import type { ArtifactsPanelStatus } from "@/features/artifacts/types";

interface ArtifactPanelHeaderProps {
  subtitle: string;
  showRegenerate: boolean;
  regenerateRunId: string;
  status: ArtifactsPanelStatus;
  trailingActions?: ReactNode;
}

export function ArtifactPanelHeader({
  subtitle,
  showRegenerate,
  regenerateRunId,
  status,
  trailingActions,
}: ArtifactPanelHeaderProps) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-2 border-b border-glass-border px-4 py-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-title font-semibold tracking-tight">Artifacts</h2>
        <p className="mt-0.5 text-caption text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {showRegenerate ? (
          <RegenerateArtifactsButton
            runId={regenerateRunId}
            disabled={status === "generating" || status === "pending"}
          />
        ) : null}
        {trailingActions}
      </div>
    </header>
  );
}
