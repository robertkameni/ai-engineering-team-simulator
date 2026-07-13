export const ARTIFACT_TYPES = [
  "requirements",
  "architecture",
  "implementation",
  "blueprint",
  "review",
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

/** Generated automatically after debate; blueprint is lazy-loaded on demand. */
export const CORE_ARTIFACT_TYPES = [
  "requirements",
  "architecture",
  "implementation",
  "review",
] as const satisfies readonly ArtifactType[];

export const LAZY_ARTIFACT_TYPES = ["blueprint"] as const satisfies readonly ArtifactType[];

export function isArtifactType(value: string): value is ArtifactType {
  return (ARTIFACT_TYPES as readonly string[]).includes(value);
}
