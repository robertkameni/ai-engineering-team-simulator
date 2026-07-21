import type { SimulationAgentRole } from "@/ai/agents/config";

import { SOFTWARE_MAX_CORRECTIONS_PER_ROLE } from "@/ai/orchestration/debate-convergence-controller";

export const MAX_CORRECTIONS_PER_ROLE = SOFTWARE_MAX_CORRECTIONS_PER_ROLE;

export function canCorrectRole(
  counts: Readonly<Partial<Record<SimulationAgentRole, number>>>,
  role: SimulationAgentRole,
): boolean {
  return (counts[role] ?? 0) < MAX_CORRECTIONS_PER_ROLE;
}

export function incrementRoleCorrectionCount(
  counts: Partial<Record<SimulationAgentRole, number>>,
  role: SimulationAgentRole,
): Partial<Record<SimulationAgentRole, number>> {
  return {
    ...counts,
    [role]: (counts[role] ?? 0) + 1,
  };
}
