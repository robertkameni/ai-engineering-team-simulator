import type { AppArtifactStatus } from "@/lib/db/artifact-status";
import type { RunStatus as AppRunStatus } from "@/features/agents/types";
import type { ArtifactsPanelStatus } from "@/features/artifacts/types";

export function deriveArtifactsPanelStatus(
  runStatus: AppRunStatus,
  artifactStatus: AppArtifactStatus,
): ArtifactsPanelStatus {
  switch (artifactStatus) {
    case "ready":
      return "ready";
    case "generating":
      return "generating";
    case "pending":
      return "generating";
    case "failed":
      return "unavailable";
    case "none":
      if (runStatus === "running") return "pending";
      if (runStatus === "failed") return "unavailable";
      if (runStatus === "complete") return "generating";
      return "idle";
    default:
      return "idle";
  }
}
