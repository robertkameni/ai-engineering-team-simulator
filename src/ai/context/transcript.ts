import type { AgentRole } from "@/features/agents/types";

export interface TranscriptEntry {
  role: AgentRole;
  agentName: string;
  content: string;
}
