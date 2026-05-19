import type { ArtifactType } from "@/features/artifacts/schemas";

export const ARTIFACT_SECTION_TITLES: Record<ArtifactType, string[]> = {
  requirements: [
    "Overview",
    "Users & problem",
    "Features (v1)",
    "User stories",
    "Out of scope",
    "Success metrics",
  ],
  architecture: [
    "Overview",
    "System design",
    "Data model",
    "APIs & integrations",
    "Decisions & risks",
  ],
  implementation: [
    "Stack",
    "Backend",
    "Frontend",
    "Testing & rollout",
    "Delivery risks",
  ],
  review: [
    "Summary",
    "Agreements & disputes",
    "Risks",
    "Recommendations",
  ],
};

export function sectionTitlesForArtifact(type: ArtifactType): string {
  return ARTIFACT_SECTION_TITLES[type].map((t) => `- ${t}`).join("\n");
}
