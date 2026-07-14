import { AlertTriangle } from "lucide-react";

import {
  hasSynthesisValidationWarnings,
  synthesisValidationWarningMessage,
} from "@/features/artifacts/synthesis-validation";
import type { SynthesisValidationFlags } from "@/features/artifacts/synthesis-validation.types";

interface ArtifactSynthesisWarningBannerProps {
  synthesisValidation: SynthesisValidationFlags | null | undefined;
}

export function ArtifactSynthesisWarningBanner({
  synthesisValidation,
}: ArtifactSynthesisWarningBannerProps) {
  if (!hasSynthesisValidationWarnings(synthesisValidation)) {
    return null;
  }

  const message = synthesisValidationWarningMessage(synthesisValidation!);

  return (
    <div
      role="status"
      className="mx-4 mb-3 flex shrink-0 items-start gap-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          Artifact validation warnings
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
