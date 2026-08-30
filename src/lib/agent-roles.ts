/**
 * Canonical simulation agent pipeline order (shared kernel — Sprint A / N1).
 * `@/ai/agents/config` re-exports these so orchestration imports stay stable.
 */
export const SIMULATION_AGENT_ORDER = [
  "pm",
  "architect",
  "backend",
  "frontend",
  "devops",
  "reviewer",
] as const;

export type SimulationAgentRole = (typeof SIMULATION_AGENT_ORDER)[number];
