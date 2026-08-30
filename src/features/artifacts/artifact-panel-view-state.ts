import type { TeamTemplateId } from "@/ai/agents/team-templates";
import {
  artifactPanelSubtitle,
  isUnapprovedDebateOutcome,
} from "@/features/artifacts/artifact-panel-phase";
import { getArtifactTabConfig } from "@/features/artifacts/artifact-tab-styles";
import {
  hasSynthesisValidationWarnings,
  parseSynthesisValidationFlags,
} from "@/features/artifacts/synthesis-validation";
import type { SynthesisValidationFlags } from "@/features/artifacts/synthesis-validation.types";
import type { ArtifactsPanelStatus, DebateProgress } from "@/features/artifacts/types";
import type { DebateExitOutcome } from "@/lib/types";

export interface ArtifactPanelViewState {
  synthesisValidation: SynthesisValidationFlags;
  subtitle: string;
  showDebateWarning: boolean;
  showSynthesisWarning: boolean;
  artifactTabs: ReturnType<typeof getArtifactTabConfig>;
}

export function buildArtifactPanelViewState(input: {
  status: ArtifactsPanelStatus;
  debateProgress?: DebateProgress;
  artifactCount: number;
  debateOutcome?: DebateExitOutcome | null;
  stackValidationFailed: boolean;
  crossValidationFailed: boolean;
  postApproveTruncation: boolean;
  templateId?: TeamTemplateId;
}): ArtifactPanelViewState {
  const synthesisValidation = parseSynthesisValidationFlags(
    input.stackValidationFailed,
    input.crossValidationFailed,
  );
  const subtitle = artifactPanelSubtitle(
    input.status,
    input.debateProgress,
    input.artifactCount,
    input.debateOutcome,
    synthesisValidation,
  );
  const showWarnings =
    input.status === "ready" || input.status === "generating";

  return {
    synthesisValidation,
    subtitle,
    showDebateWarning:
      showWarnings &&
      (isUnapprovedDebateOutcome(input.debateOutcome) ||
        input.postApproveTruncation),
    showSynthesisWarning:
      showWarnings && hasSynthesisValidationWarnings(synthesisValidation),
    artifactTabs: getArtifactTabConfig(input.templateId ?? "software"),
  };
}
