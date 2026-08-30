import { ArtifactDebateWarningBanner } from "@/features/artifacts/artifact-debate-warning-banner";
import { ArtifactSynthesisWarningBanner } from "@/features/artifacts/artifact-synthesis-warning-banner";
import type { SynthesisValidationFlags } from "@/features/artifacts/synthesis-validation.types";
import type { DebateExitOutcome } from "@/lib/types";

interface ArtifactPanelWarningsProps {
  showDebateWarning: boolean;
  showSynthesisWarning: boolean;
  debateOutcome?: DebateExitOutcome | null;
  postApproveTruncation?: boolean;
  synthesisValidation: SynthesisValidationFlags;
}

export function ArtifactPanelWarnings({
  showDebateWarning,
  showSynthesisWarning,
  debateOutcome = null,
  postApproveTruncation = false,
  synthesisValidation,
}: ArtifactPanelWarningsProps) {
  return (
    <>
      {showDebateWarning ? (
        <ArtifactDebateWarningBanner
          debateOutcome={debateOutcome}
          postApproveTruncation={postApproveTruncation}
        />
      ) : null}

      {showSynthesisWarning ? (
        <ArtifactSynthesisWarningBanner synthesisValidation={synthesisValidation} />
      ) : null}
    </>
  );
}
