"use client";

import { RefreshCw } from "lucide-react";
import { useFormStatus } from "react-dom";

import { regenerateRunArtifactsAction } from "@/features/artifacts/regenerate-artifacts-action";
import { Button } from "@/components/ui/button";
import { workspaceHeaderRegenerateButtonClass } from "@/features/workspace/workspace-header-button-styles";
import { cn } from "@/lib/utils";

interface RegenerateArtifactsButtonProps {
  runId: string;
  disabled?: boolean;
  className?: string;
  variant?: "header" | "placeholder";
}

function RegenerateSubmit({
  disabled,
  className,
  variant,
}: Omit<RegenerateArtifactsButtonProps, "runId">) {
  const { pending } = useFormStatus();
  const isPlaceholder = variant === "placeholder";
  const loading = pending;
  const tooltip = loading ? "Regenerating artifacts" : "Regenerate artifacts";

  return (
    <Button
      type="submit"
      variant={isPlaceholder ? "default" : "outline"}
      size={isPlaceholder ? "default" : "sm"}
      disabled={disabled || loading}
      aria-label={tooltip}
      title={tooltip}
      className={cn(
        isPlaceholder
          ? "mt-4 gap-2"
          : workspaceHeaderRegenerateButtonClass,
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

export function RegenerateArtifactsButton({
  runId,
  disabled = false,
  className,
  variant = "header",
}: RegenerateArtifactsButtonProps) {
  return (
    <form action={regenerateRunArtifactsAction}>
      <input type="hidden" name="runId" value={runId} />
      <RegenerateSubmit
        disabled={disabled}
        className={className}
        variant={variant}
      />
    </form>
  );
}
