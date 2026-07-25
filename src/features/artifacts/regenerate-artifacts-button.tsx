"use client";

import { RefreshCw } from "lucide-react";
import { useActionState } from "react";

import {
  regenerateArtifactsInitialState,
  type RegenerateArtifactsActionState,
} from "@/features/artifacts/regenerate-artifacts-state";
import { regenerateRunArtifactsAction } from "@/features/artifacts/regenerate-artifacts-action";
import { Button } from "@/components/ui/button";
import { workspaceHeaderRegenerateButtonClass } from "@/components/ui/button-styles";
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
  pending,
}: Omit<RegenerateArtifactsButtonProps, "runId"> & { pending: boolean }) {
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

function RegenerateActionFeedback({ state }: { state: RegenerateArtifactsActionState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="mt-2 text-center text-xs text-destructive @max-sm/artifact-panel:px-4"
      >
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p className="mt-2 text-center text-xs text-muted-foreground @max-sm/artifact-panel:px-4">
        Artifacts regenerated.
      </p>
    );
  }
  return null;
}

export function RegenerateArtifactsButton({
  runId,
  disabled = false,
  className,
  variant = "header",
}: RegenerateArtifactsButtonProps) {
  const [state, formAction, pending] = useActionState(
    regenerateRunArtifactsAction,
    regenerateArtifactsInitialState,
  );
  const isPlaceholder = variant === "placeholder";

  return (
    <div className={cn(isPlaceholder ? "flex w-full flex-col items-center" : undefined)}>
      <form action={formAction}>
        <input type="hidden" name="runId" value={runId} />
        <RegenerateSubmit
          disabled={disabled}
          className={className}
          variant={variant}
          pending={pending}
        />
      </form>
      <RegenerateActionFeedback state={state} />
    </div>
  );
}
