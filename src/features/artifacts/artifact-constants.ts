export const ARTIFACT_TYPES = [
  "requirements",
  "architecture",
  "implementation",
  "review",
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export function isArtifactType(value: string): value is ArtifactType {
  return (ARTIFACT_TYPES as readonly string[]).includes(value);
}
