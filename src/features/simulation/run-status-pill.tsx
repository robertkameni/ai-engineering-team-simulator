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

interface RunStatusPillProps {
  status: RunStatus;
  className?: string;
}

export function RunStatusPill({ status, className }: RunStatusPillProps) {
  return (
    <Badge
      variant="outline"
      className={cn("font-normal", STATUS_STYLES[status], className)}
    >
      {status === "running" ? (
        <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-current" />
      ) : null}
      {STATUS_LABELS[status]}
    </Badge>
  );
}
