import type { DeepSeekLanguageModelOptions } from "@ai-sdk/deepseek";

import {
  DEEPSEEK_CHAT_OPTIONS,
  DEEPSEEK_REASONING_OPTIONS,
} from "@/ai/deepseek-options";
import type { DeepSeekModelId } from "@/ai/providers";
import type { AgentRole } from "@/features/agents/types";

export interface AgentModelConfig {
  role: AgentRole;
  model: DeepSeekModelId;
  maxOutputTokens: number;
  temperature: number;
  deepseek: DeepSeekLanguageModelOptions;
}

/** PM → Architect → Backend → Frontend → Reviewer */
export const SIMULATION_AGENT_ORDER = [
  "pm",
  "architect",
  "backend",
  "frontend",
  "reviewer",
] as const;

export type SimulationAgentRole = (typeof SIMULATION_AGENT_ORDER)[number];

export const ACTIVE_AGENTS: AgentModelConfig[] = [
  {
    role: "pm",
    model: "deepseek-v4-flash",
    maxOutputTokens: 1600,
    temperature: 0.7,
    deepseek: DEEPSEEK_CHAT_OPTIONS,
  },
  {
    role: "architect",
    model: "deepseek-v4-pro",
    maxOutputTokens: 2200,
    temperature: 0.5,
    deepseek: DEEPSEEK_REASONING_OPTIONS,
  },
  {
    role: "backend",
    model: "deepseek-v4-pro",
    maxOutputTokens: 1800,
    temperature: 0.55,
    deepseek: DEEPSEEK_CHAT_OPTIONS,
  },
  {
    role: "frontend",
    model: "deepseek-v4-flash",
    maxOutputTokens: 1800,
    temperature: 0.6,
    deepseek: DEEPSEEK_CHAT_OPTIONS,
  },
  {
    role: "reviewer",
    model: "deepseek-v4-flash",
    maxOutputTokens: 1600,
    temperature: 0.6,
    deepseek: DEEPSEEK_CHAT_OPTIONS,
  },
];

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
