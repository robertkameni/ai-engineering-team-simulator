import type { AgentRole } from "@/lib/types";

/**
 * Agent UI persona types only. Shared domain types live in `@/lib/types`
 * (arch-review F4 — breaks agents ↔ artifacts cycle).
 */
export type {
  AgentRole,
  RunStatus,
  SimulationMessage,
  MockRun,
  DebateExitOutcome,
} from "@/lib/types";

export interface AgentPersonaBase {
  role: AgentRole;
  name: string;
  title: string;
  initials: string;
}

export interface AgentPersona extends AgentPersonaBase {
  accentClass: string;
  borderClass: string;
  badgeClass: string;
}
