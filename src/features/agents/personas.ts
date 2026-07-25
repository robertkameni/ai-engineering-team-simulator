/**
 * Re-export shared personas from the kernel (arch-review Sprint A).
 * Non-workspace features must import from `@/lib/agents/personas`.
 */
export {
  AGENT_PERSONAS,
  getPersona,
  getPersonaBase,
} from "@/lib/agents/personas";
