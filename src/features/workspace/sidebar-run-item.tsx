"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  SidebarRunLinkContent,
  sidebarRunLinkClassName,
  sidebarRunRowClassName,
} from "@/features/workspace/sidebar-run-link-content";
import type { SidebarRunItemData } from "@/features/workspace/sidebar-types";

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
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const href = `/runs/${run.id}`;

  async function handleDelete(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (deleting) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/runs/${run.id}`, { method: "DELETE" });

      if (!response.ok && response.status !== 404) {
        setDeleteError("Failed to delete run. Please try again.");
        return;
      }

      onDeleted(run.id);

      if (isActive) {
        router.push("/workspace");
      }
    } catch {
      setDeleteError("Network error. Please check your connection and try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={sidebarRunRowClassName(isActive)}>
      <Link
        href={href}
        onClick={onNavigate}
        className={sidebarRunLinkClassName(isActive)}
        title={run.title}
      >
        <SidebarRunLinkContent run={run} />
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
      {deleteError ? (
        <p
          role="alert"
          className="absolute right-1 top-full z-10 mt-1 max-w-48 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive"
        >
          {deleteError}
        </p>
      ) : null}
    </div>
  );
}
