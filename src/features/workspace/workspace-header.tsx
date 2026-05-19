import { RunStatusPill } from "@/features/simulation/run-status-pill";
import type { RunStatus } from "@/features/agents/types";
import { cn } from "@/lib/utils";

interface WorkspaceHeaderProps {
  title: string;
  status: RunStatus;
  subtitle?: string;
  className?: string;
}

export function WorkspaceHeader({
  title,
  status,
  subtitle,
  className,
}: WorkspaceHeaderProps) {
  return (
    <header
      className={cn(
        "flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      <RunStatusPill status={status} />
    </header>
  );
}
