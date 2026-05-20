import type { ArtifactType } from "@/features/artifacts/artifact-constants";

export interface ArtifactSectionGroup {
  title: string;
  items: string[];
}

/** Artifacts keyed by tab — matches `Artifact` rows in the database. */
export type RunArtifacts = Record<ArtifactType, ArtifactSectionGroup[]>;

export type ArtifactsPanelStatus =
  | "idle"
  | "pending"
  | "generating"
  | "ready"
  | "unavailable";
