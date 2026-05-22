import { SIMULATION_AGENT_ORDER } from "@/ai/agents/config";
import type { AgentRole } from "@/features/agents/types";
import type { ArtifactsPanelStatus } from "@/features/artifacts/types";

export interface DebateProgress {
  completed: number;
  total: number;
  activeRole: AgentRole | null;
}

export function artifactPanelSubtitle(
  status: ArtifactsPanelStatus,
  debateProgress?: DebateProgress,
): string {
  switch (status) {
    case "pending":
      if (debateProgress && debateProgress.completed > 0) {
        return `Discussion · ${debateProgress.completed}/${debateProgress.total} teammates spoke`;
      }
      return "Phase 1 · waiting for debate";
    case "generating":
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
    total: SIMULATION_AGENT_ORDER.length,
    activeRole: activeAgent,
  };
}

export { SIMULATION_AGENT_ORDER as debateAgentOrder };
