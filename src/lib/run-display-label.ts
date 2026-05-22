import type { RunStatus as AppRunStatus } from "@/features/agents/types";
import type { ArtifactsPanelStatus } from "@/features/artifacts/types";
import type { AppArtifactStatus } from "@/lib/db/artifact-status";

export function panelToAppArtifactStatus(
  runStatus: AppRunStatus,
  panel?: ArtifactsPanelStatus,
): AppArtifactStatus {
  switch (panel) {
    case "ready":
      return "ready";
    case "generating":
      return "generating";
    case "pending":
      return "pending";
    case "unavailable":
      return runStatus === "complete" ? "failed" : "none";
    default:
      return "none";
  }
}

export function deriveRunDisplayLabel(
  runStatus: AppRunStatus,
  artifactStatus: AppArtifactStatus,
  artifactsPanelStatus?: ArtifactsPanelStatus,
): string {
  if (runStatus === "running") {
    if (artifactStatus === "generating" || artifactStatus === "pending") {
      return "Synthesizing";
    }
    return "Debating";
  }
  if (runStatus === "complete" && artifactStatus === "failed") {
    return "Debate done";
  }
  if (
    runStatus === "complete" &&
    artifactsPanelStatus === "unavailable" &&
    artifactStatus !== "ready"
  ) {
    return "Debate done";
  }
  const labels: Record<AppRunStatus, string> = {
    idle: "Idle",
    running: "Running",
    complete: "Complete",
    failed: "Failed",
  };
  return labels[runStatus];
}
