import {
  SIMULATION_AGENT_ORDER,
  type SimulationAgentRole,
} from "@/ai/agents/config";

/** Narrows persisted `agentRole` strings into known simulation roster roles. */
export function isStoredSimulationAgentRole(
  role: string,
): role is SimulationAgentRole {
  return SIMULATION_AGENT_ORDER.includes(role as SimulationAgentRole);
}
