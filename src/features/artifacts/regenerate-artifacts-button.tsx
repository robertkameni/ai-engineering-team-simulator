"use client";

import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RegenerateArtifactsButtonProps {
  onRegenerate: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  variant?: "header" | "placeholder";
}

export function RegenerateArtifactsButton({
  onRegenerate,
  disabled = false,
  loading = false,
  className,
  variant = "header",
}: RegenerateArtifactsButtonProps) {
  const isPlaceholder = variant === "placeholder";

  return (
    <Button
      type="button"
      variant={isPlaceholder ? "default" : "outline"}
      size={isPlaceholder ? "default" : "sm"}
      disabled={disabled || loading}
      onClick={() => void onRegenerate()}
      aria-label={loading ? "Regenerating artifacts" : "Regenerate artifacts"}
      className={cn(
        isPlaceholder
          ? "mt-4 gap-2"
          : "glass-card h-8 shrink-0 gap-1.5 border-glass-border px-2.5 text-caption",
        className,
      )}
      aria-busy={loading}
    >
      <RefreshCw
        className={cn("size-3.5", loading && "animate-spin")}
        aria-hidden
      />
      {isPlaceholder ? (
        <span>{loading ? "Regenerating…" : "Regenerate artifacts"}</span>
      ) : (
        <span className="hidden @[420px]/artifact-panel:inline">
          {loading ? "Regenerating…" : "Regenerate"}
        </span>
      )}
    </Button>
  );
}
