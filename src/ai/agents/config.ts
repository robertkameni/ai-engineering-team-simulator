import type { DeepSeekLanguageModelOptions } from "@ai-sdk/deepseek";

import { DEEPSEEK_CHAT_OPTIONS, DEEPSEEK_REASONING_OPTIONS } from "@/ai/deepseek-options";
import type { DeepSeekModelId } from "@/ai/providers";
import type { AgentRole } from "@/features/agents/types";

export interface AgentModelConfig {
  role: AgentRole;
  model: DeepSeekModelId;
  maxOutputTokens: number;
  temperature: number;
  deepseek: DeepSeekLanguageModelOptions;
}

/** PM → Architect → Backend → Frontend → DevOps → Reviewer */
export const SIMULATION_AGENT_ORDER = [
  "pm",
  "architect",
  "backend",
  "frontend",
  "devops",
  "reviewer",
] as const;

export type SimulationAgentRole = (typeof SIMULATION_AGENT_ORDER)[number];

export const ACTIVE_AGENTS: AgentModelConfig[] = [
  {
    role: "pm",
    model: "deepseek-v4-flash",
    maxOutputTokens: 2200,
    temperature: 0.4,
    deepseek: DEEPSEEK_CHAT_OPTIONS,
  },
  {
    role: "architect",
    model: "deepseek-v4-pro",
    maxOutputTokens: 3200,
    temperature: 0.4,
    deepseek: DEEPSEEK_REASONING_OPTIONS,
  },
  {
    role: "backend",
    model: "deepseek-v4-pro",
    maxOutputTokens: 2600,
    temperature: 0.35,
    deepseek: DEEPSEEK_CHAT_OPTIONS,
  },
  {
    role: "frontend",
    model: "deepseek-v4-flash",
    maxOutputTokens: 2200,
    temperature: 0.4,
    deepseek: DEEPSEEK_CHAT_OPTIONS,
  },
  {
    role: "devops",
    model: "deepseek-v4-flash",
    maxOutputTokens: 2200,
    temperature: 0.4,
    deepseek: DEEPSEEK_CHAT_OPTIONS,
  },
  {
    role: "reviewer",
    model: "deepseek-v4-flash",
    maxOutputTokens: 2600,
    temperature: 0.35,
    deepseek: DEEPSEEK_CHAT_OPTIONS,
  },
];

/** Cap for truncation continuation streams (same turn). */
export const TRUNCATION_CONTINUATION_MAX_OUTPUT_TOKENS = 2000;

export function getAgentConfig(role: AgentRole): AgentModelConfig {
  const config = ACTIVE_AGENTS.find((agent) => agent.role === role);
  if (!config) {
    throw new Error(`No model config for agent role: ${role}`);
  }
  return config;
}

export function isSimulationAgent(
  role: AgentRole,
): role is SimulationAgentRole {
  return SIMULATION_AGENT_ORDER.includes(role as SimulationAgentRole);
}
