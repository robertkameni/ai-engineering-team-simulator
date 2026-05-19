import type { AgentRole } from "@/features/agents/types";
import type { DeepSeekModelId } from "@/ai/providers";

export interface AgentModelConfig {
  role: AgentRole;
  model: DeepSeekModelId;
  maxOutputTokens: number;
  temperature: number;
}

/** Phase 3: PM only. Phase 4 will extend this list. */
export const ACTIVE_AGENTS: AgentModelConfig[] = [
  {
    role: "pm",
    model: "deepseek-v4-flash",
    maxOutputTokens: 1500,
    temperature: 0.7,
  },
];

export function getAgentConfig(role: AgentRole): AgentModelConfig {
  const config = ACTIVE_AGENTS.find((agent) => agent.role === role);
  if (!config) {
    throw new Error(`No model config for agent role: ${role}`);
  }
  return config;
}
