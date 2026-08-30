import type { DeepSeekLanguageModelOptions } from "@ai-sdk/deepseek";

import { DEEPSEEK_CHAT_OPTIONS, DEEPSEEK_REASONING_OPTIONS } from "@/ai/deepseek-options";
import type { DeepSeekModelId } from "@/ai/providers";
import { SIMULATION_AGENT_ORDER, type SimulationAgentRole } from "@/lib/agent-roles";
import type { AgentRole } from "@/lib/types";

export { SIMULATION_AGENT_ORDER, type SimulationAgentRole };

export interface AgentModelConfig {
  role: AgentRole;
  model: DeepSeekModelId;
  maxOutputTokens: number;
  temperature: number;
  deepseek: DeepSeekLanguageModelOptions;
}

const DEFAULT_ARCHITECT_MODEL: DeepSeekModelId = "deepseek-v4-pro";

/** A/B switch: `ARCHITECT_MODEL=deepseek-v4-flash` runs the architect on flash. */
export function resolveArchitectModel(): DeepSeekModelId {
  const raw = process.env.ARCHITECT_MODEL?.trim();
  if (raw === "deepseek-v4-flash") {
    return "deepseek-v4-flash";
  }
  return DEFAULT_ARCHITECT_MODEL;
}

function buildArchitectConfig(): AgentModelConfig {
  const model = resolveArchitectModel();
  return {
    role: "architect",
    model,
    maxOutputTokens: 2000,
    temperature: 0.4,
    deepseek:
      model === "deepseek-v4-pro"
        ? DEEPSEEK_REASONING_OPTIONS
        : DEEPSEEK_CHAT_OPTIONS,
  };
}

const ACTIVE_AGENTS: Record<SimulationAgentRole, AgentModelConfig> = {
  pm: {
    role: "pm",
    model: "deepseek-v4-flash",
    maxOutputTokens: 1700,
    temperature: 0.4,
    deepseek: DEEPSEEK_CHAT_OPTIONS,
  },
  architect: buildArchitectConfig(),
  backend: {
    role: "backend",
    model: "deepseek-v4-flash",
    maxOutputTokens: 1600,
    temperature: 0.35,
    deepseek: DEEPSEEK_CHAT_OPTIONS,
  },
  frontend: {
    role: "frontend",
    model: "deepseek-v4-flash",
    maxOutputTokens: 2200,
    temperature: 0.4,
    deepseek: DEEPSEEK_CHAT_OPTIONS,
  },
  devops: {
    role: "devops",
    model: "deepseek-v4-flash",
    maxOutputTokens: 1500,
    temperature: 0.4,
    deepseek: DEEPSEEK_CHAT_OPTIONS,
  },
  reviewer: {
    role: "reviewer",
    model: "deepseek-v4-flash",
    maxOutputTokens: 1600,
    temperature: 0.35,
    deepseek: DEEPSEEK_CHAT_OPTIONS,
  },
};

/** Cap for truncation continuation streams (same turn). */
export const TRUNCATION_CONTINUATION_MAX_OUTPUT_TOKENS = 1200;

/** Max continuation streams per agent turn when output looks truncated. */
export const MAX_TRUNCATION_CONTINUATIONS = 2;

export function getAgentConfig(role: SimulationAgentRole): AgentModelConfig {
  return ACTIVE_AGENTS[role];
}

/**
 * DeepSeek ignores `temperature` while thinking is enabled (the architect's
 * reasoning model) — passing it triggers an AI SDK warning. Chat roles opt out
 * of thinking explicitly via DEEPSEEK_CHAT_OPTIONS.
 */
export function supportsTemperature(config: AgentModelConfig): boolean {
  return config.deepseek.thinking?.type === "disabled";
}

export function isSimulationAgent(
  role: AgentRole,
): role is SimulationAgentRole {
  return SIMULATION_AGENT_ORDER.includes(role as SimulationAgentRole);
}
