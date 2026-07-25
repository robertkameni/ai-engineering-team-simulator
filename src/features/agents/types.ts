/**
 * Agent UI persona types only. Shared domain types live in `@/lib/types`
 * (arch-review F4 — breaks agents ↔ artifacts cycle).
 */
export type {
  AgentRole,
  AgentPersona,
  AgentPersonaBase,
  RunStatus,
  SimulationMessage,
  MockRun,
  DebateExitOutcome,
} from "@/lib/types";
