import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AuthStatusBadgeProps {
  isAuthenticated: boolean;
  className?: string;
}

export function AuthStatusBadge({
  isAuthenticated,
  className,
}: AuthStatusBadgeProps) {
  if (isAuthenticated) {
    return null;
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 border-amber-500/40 bg-amber-500/10 font-normal text-amber-600 dark:text-amber-400",
        className,
      )}
      title="Public session — runs are not private"
    >
      <span className="hidden @[720px]/workspace-header:inline">
        Public session — runs are not private
      </span>
      <span className="@[720px]/workspace-header:hidden">Public</span>
    </Badge>
  );
}
