import { SIMULATION_AGENT_ORDER } from "@/ai/agents/config";
import { MAX_SIMULATION_TURNS } from "@/ai/orchestration/reviewer-decision";
import { ARTIFACT_TYPES } from "@/features/artifacts/artifact-constants";
import type { AgentRole } from "@/features/agents/types";
import type {
  ArtifactsPanelStatus,
  PartialRunArtifacts,
} from "@/features/artifacts/types";

export interface DebateProgress {
  completed: number;
  total: number;
  activeRole: AgentRole | null;
}

export function countRunArtifacts(
  artifacts: PartialRunArtifacts | null | undefined,
): number {
  if (!artifacts) return 0;
  return ARTIFACT_TYPES.filter((type) => artifacts[type] != null).length;
}

export function shouldShowArtifactTabs(
  status: ArtifactsPanelStatus,
  artifacts: PartialRunArtifacts | null | undefined,
): boolean {
  const count = countRunArtifacts(artifacts);
  if (count === 0) return false;
  if (status === "generating") return true;
  return status === "ready" && count === ARTIFACT_TYPES.length;
}

export function artifactPanelSubtitle(
  status: ArtifactsPanelStatus,
  debateProgress?: DebateProgress,
  artifactCount?: number,
): string {
  switch (status) {
    case "pending":
      if (debateProgress && debateProgress.completed > 0) {
        return `Discussion · ${debateProgress.completed} turn${debateProgress.completed === 1 ? "" : "s"}`;
      }
      return "Phase 1 · waiting for debate";
    case "generating":
      if (artifactCount != null && artifactCount > 0) {
        return `Phase 2 · ${artifactCount} of ${ARTIFACT_TYPES.length} deliverables ready`;
      }
      return "Phase 2 · synthesizing deliverables";
    case "ready":
      return "Phase 3 · ready to review";
    case "unavailable":
      return "Deliverables unavailable";
    default:
      return "Structured outputs from the team";
  }
}

export function debateProgressFromMessages(
  messages: { role: AgentRole; isStreaming?: boolean }[],
  activeAgent: AgentRole | null,
): DebateProgress {
  const completed = messages.filter((message) => !message.isStreaming).length;

  return {
    completed,
    total: MAX_SIMULATION_TURNS,
    activeRole: activeAgent,
  };
}

export { SIMULATION_AGENT_ORDER as debateAgentOrder };
