import type { ArtifactDocument, ArtifactType } from "@/features/artifacts/schemas";
import { CORE_ARTIFACT_TYPES } from "@/lib/artifact-constants";

/**
 * Placeholder document when synthesis fails after retry. Keeps export at 5/5
 * sections with an explicit failure marker instead of a silent omission.
 */
export function buildFailedArtifactPlaceholder(
  type: ArtifactType,
  errorMessage: string,
): ArtifactDocument {
  return {
    sections: [
      {
        title: "Synthesis failed",
        items: [
          `The ${type} artifact could not be generated.`,
          errorMessage.trim() || "Unknown synthesis error.",
        ],
      },
    ],
    artifactSynthesisFailed: true,
    artifactErrorMessage: errorMessage.trim() || "Unknown synthesis error.",
  };
}

export function listMissingCoreArtifactTypes(
  present: ReadonlySet<string> | readonly string[],
): ArtifactType[] {
  const presentSet = present instanceof Set ? present : new Set(present);
  return CORE_ARTIFACT_TYPES.filter((type) => !presentSet.has(type));
}
