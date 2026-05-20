"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SidebarRunItemData } from "@/features/workspace/sidebar-types";
import { cn } from "@/lib/utils";

export type { SidebarRunItemData };

interface SidebarRunItemProps {
  run: SidebarRunItemData;
  isActive: boolean;
  onDeleted: (runId: string) => void;
  onNavigate?: () => void;
}

export function SidebarRunItem({
  run,
  isActive,
  onDeleted,
  onNavigate,
}: SidebarRunItemProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const href = `/runs/${run.id}`;

  async function handleDelete(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (deleting) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/runs/${run.id}`, { method: "DELETE" });
      if (!response.ok) return;

      onDeleted(run.id);
      if (isActive) {
        router.push("/workspace");
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className={cn(
        "group flex items-stretch gap-0.5 rounded-lg transition-all duration-200",
        isActive ? "glass-card border-l-2 border-l-foreground" : "hover:bg-white/4",
      )}
    >
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(
          "min-w-0 flex-1 rounded-md px-3 py-2",
          isActive
            ? "border-l-2 border-l-foreground pl-[10px]"
            : "border-l-2 border-l-transparent",
        )}
        title={run.title}
      >
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
      </Link>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={deleting}
        onClick={handleDelete}
        aria-label={`Delete run: ${run.title}`}
        className="my-1 mr-1 size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-70"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
