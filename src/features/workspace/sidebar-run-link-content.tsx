import type { SidebarRunItemData } from "@/features/workspace/sidebar-types";
import { cn } from "@/lib/utils";

interface SidebarRunLinkContentProps {
  run: SidebarRunItemData;
}

export function SidebarRunLinkContent({ run }: SidebarRunLinkContentProps) {
  return (
    <>
      <p className="line-clamp-2 text-body leading-snug wrap-break-word text-foreground">
        {run.title}
      </p>
      <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            run.status === "running"
              ? "bg-agent-architect"
              : run.status === "complete"
                ? "bg-agent-backend"
                : run.status === "failed"
                  ? "bg-destructive"
                  : "bg-muted-foreground",
          )}
        />
        <span className="truncate">{run.updatedAt}</span>
      </p>
    </>
  );
}

export function sidebarRunLinkClassName(isActive: boolean): string {
  return cn(
    "min-w-0 flex-1 rounded-md px-3 py-2",
    isActive
      ? "border-l-2 border-l-foreground pl-[10px]"
      : "border-l-2 border-l-transparent",
  );
}

export function sidebarRunRowClassName(isActive: boolean): string {
  return cn(
    "group flex items-stretch gap-0.5 rounded-lg transition-all duration-200",
    isActive ? "glass-card border-l-2 border-l-foreground" : "hover:bg-white/4",
  );
}
