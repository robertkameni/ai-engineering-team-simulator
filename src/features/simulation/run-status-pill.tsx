import type { RunStatus } from "@/features/agents/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<RunStatus, string> = {
  idle: "Idle",
  running: "Running",
  complete: "Complete",
  failed: "Failed",
};

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
  className?: string;
  compactOnMobile?: boolean;
}

export function RunStatusPill({
  status,
  className,
  compactOnMobile = false,
}: RunStatusPillProps) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-normal", STATUS_STYLES[status], className)}
      title={STATUS_LABELS[status]}
    >
      {compactOnMobile ? (
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            STATUS_DOTS[status],
            status === "running" && "animate-pulse",
          )}
          aria-hidden
        />
      ) : status === "running" ? (
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
      ) : null}
      <span
        className={cn(
          compactOnMobile && "sr-only @[420px]/workspace-header:not-sr-only",
        )}
      >
        {STATUS_LABELS[status]}
      </span>
    </Badge>
  );
}
