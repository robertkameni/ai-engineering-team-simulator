export const ARTIFACT_TYPES = [
  "requirements",
  "architecture",
  "implementation",
  "blueprint",
  "review",
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

/** Generated automatically after debate (includes blueprint). */
export const CORE_ARTIFACT_TYPES = [
  "requirements",
  "architecture",
  "implementation",
  "blueprint",
  "review",
] as const satisfies readonly ArtifactType[];

export function isArtifactType(value: string): value is ArtifactType {
  return (ARTIFACT_TYPES as readonly string[]).includes(value);
}
