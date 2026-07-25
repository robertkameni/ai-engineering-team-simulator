import type { ArtifactsPanelStatus, RunStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  deriveRunDisplayLabel,
  panelToAppArtifactStatus,
} from "@/lib/run-display-label";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<RunStatus, string> = {
  idle: "text-muted-foreground",
  running: "border-agent-architect/40 bg-agent-architect/10 text-agent-architect",
  complete: "border-agent-backend/40 bg-agent-backend/10 text-agent-backend",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
};

const STATUS_DOTS: Record<RunStatus, string> = {
  idle: "bg-muted-foreground",
  running: "bg-agent-architect",
  complete: "bg-agent-backend",
  failed: "bg-destructive",
};

interface RunStatusPillProps {
  status: RunStatus;
  artifactsStatus?: ArtifactsPanelStatus;
  className?: string;
  compactOnMobile?: boolean;
}

export function RunStatusPill({
  status,
  artifactsStatus,
  className,
  compactOnMobile = false,
}: RunStatusPillProps) {
  const label = deriveRunDisplayLabel(
    status,
    panelToAppArtifactStatus(status, artifactsStatus),
    artifactsStatus,
  );
  const isActive = status === "running";

  return (
    <Badge
      variant="outline"
      className={cn("shrink-0 gap-1.5 font-normal", STATUS_STYLES[status], className)}
      title={label}
    >
      {compactOnMobile ? (
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            STATUS_DOTS[status],
            isActive && "animate-pulse",
          )}
          aria-hidden
        />
      ) : isActive ? (
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
      ) : null}
      <span
        className={cn(
          compactOnMobile && "sr-only @[480px]/workspace-header:not-sr-only",
        )}
      >
        {label}
      </span>
    </Badge>
  );
}
