/**
 * Artifact feature type barrel — re-exports shared domain types from lib.
 * Arch-review F4: no import from `@/features`; types come from `@/lib/types`.
 */
export type {
  AgentRole,
  ArtifactsPanelStatus,
  DebateProgress,
  ArtifactSectionGroup,
  RunArtifacts,
  PartialRunArtifacts,
} from "@/lib/types";
