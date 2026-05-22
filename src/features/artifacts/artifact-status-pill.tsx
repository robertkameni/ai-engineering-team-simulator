import type { DebateProgress } from "@/features/artifacts/artifact-panel-phase";
import type { ArtifactsPanelStatus } from "@/features/artifacts/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function pendingLabel(progress?: DebateProgress): string {
  if (progress && progress.completed > 0) {
    return `Debate · ${progress.completed}/${progress.total}`;
  }
  return "Debate · in progress";
}

const STATUS_LABELS: Record<
  Exclude<ArtifactsPanelStatus, "idle" | "ready" | "pending">,
  string
> = {
  generating: "Synthesizing artifacts",
  unavailable: "Artifacts unavailable",
};

const STATUS_STYLES: Record<
  Exclude<ArtifactsPanelStatus, "idle" | "ready">,
  string
> = {
  pending: "border-agent-pm/40 bg-agent-pm/10 text-agent-pm",
  generating: "border-agent-architect/40 bg-agent-architect/10 text-agent-architect",
  unavailable: "border-destructive/40 bg-destructive/10 text-destructive",
};

interface ArtifactStatusPillProps {
  status: ArtifactsPanelStatus;
  debateProgress?: DebateProgress;
  className?: string;
}

export function ArtifactStatusPill({
  status,
  debateProgress,
  className,
}: ArtifactStatusPillProps) {
  if (status === "idle" || status === "ready") {
    return null;
  }

  const label =
    status === "pending" ? pendingLabel(debateProgress) : STATUS_LABELS[status];
  const styles = STATUS_STYLES[status];

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-normal",
        styles,
        status === "generating" && "animate-pulse",
        className,
      )}
    >
      {status === "generating" ? (
        <span className="size-1.5 rounded-full bg-current" aria-hidden />
      ) : null}
      <span className="hidden @[520px]/workspace-header:inline">{label}</span>
      <span className="@[520px]/workspace-header:hidden" aria-hidden>
        ◆
      </span>
      <span className="sr-only @[520px]/workspace-header:hidden">{label}</span>
    </Badge>
  );
}
