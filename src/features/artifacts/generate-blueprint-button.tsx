"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import type { PartialRunArtifacts } from "@/features/artifacts/types";

interface GenerateBlueprintButtonProps {
  runId: string;
  onGenerated: (artifacts: PartialRunArtifacts) => void;
}

export function GenerateBlueprintButton({
  runId,
  onGenerated,
}: GenerateBlueprintButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch(`/api/runs/${runId}/artifacts/blueprint`, {
        method: "POST",
      });

      const payload = (await response.json().catch(() => null)) as
        | { artifacts?: PartialRunArtifacts; error?: string; message?: string }
        | null;

      if (!response.ok) {
        const message =
          payload?.message ??
          payload?.error ??
          `Blueprint generation failed (${response.status})`;
        throw new Error(message);
      }

      if (payload?.artifacts) {
        onGenerated(payload.artifacts);
      }
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Blueprint generation failed",
      );
    } finally {
      setIsGenerating(false);
    }
  }, [onGenerated, runId]);

  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <p className="text-body text-muted-foreground">
        Blueprint details are generated on demand to keep the initial simulation
        fast. Create build-ready specs when you need them.
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={handleGenerate}
        disabled={isGenerating}
      >
        {isGenerating ? "Generating blueprint…" : "Generate blueprint"}
      </Button>
      {error ? (
        <p className="text-caption text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
