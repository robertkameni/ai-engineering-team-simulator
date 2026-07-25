import type { AgentPersona, AgentPersonaBase, AgentRole } from "@/lib/types";

const BASE_PERSONAS: Record<AgentRole, AgentPersonaBase> = {
  pm: {
    role: "pm",
    name: "Morgan",
    title: "Product Manager",
    initials: "PM",
  },
  architect: {
    role: "architect",
    name: "Alex",
    title: "Architect",
    initials: "AR",
  },
  frontend: {
    role: "frontend",
    name: "Jordan",
    title: "Frontend Developer",
    initials: "FE",
  },
  backend: {
    role: "backend",
    name: "Riley",
    title: "Backend Developer",
    initials: "BE",
  },
  reviewer: {
    role: "reviewer",
    name: "Sam",
    title: "Reviewer",
    initials: "RV",
  },
  devops: {
    role: "devops",
    name: "Casey",
    title: "DevOps",
    initials: "DO",
  },
};

export const AGENT_PERSONAS: Record<AgentRole, AgentPersona> = {
  pm: {
    ...BASE_PERSONAS.pm,
    accentClass: "text-agent-pm",
    borderClass: "border-l-agent-pm",
    badgeClass: "border-agent-pm/40 bg-agent-pm/10 text-agent-pm",
  },
  architect: {
    ...BASE_PERSONAS.architect,
    accentClass: "text-agent-architect",
    borderClass: "border-l-agent-architect",
    badgeClass:
      "border-agent-architect/40 bg-agent-architect/10 text-agent-architect",
  },
  frontend: {
    ...BASE_PERSONAS.frontend,
    accentClass: "text-agent-frontend",
    borderClass: "border-l-agent-frontend",
    badgeClass:
      "border-agent-frontend/40 bg-agent-frontend/10 text-agent-frontend",
  },
  backend: {
    ...BASE_PERSONAS.backend,
    accentClass: "text-agent-backend",
    borderClass: "border-l-agent-backend",
    badgeClass:
      "border-agent-backend/40 bg-agent-backend/10 text-agent-backend",
  },
  reviewer: {
    ...BASE_PERSONAS.reviewer,
    accentClass: "text-agent-reviewer",
    borderClass: "border-l-agent-reviewer",
    badgeClass:
      "border-agent-reviewer/40 bg-agent-reviewer/10 text-agent-reviewer",
  },
  devops: {
    ...BASE_PERSONAS.devops,
    accentClass: "text-agent-devops",
    borderClass: "border-l-agent-devops",
    badgeClass:
      "border-agent-devops/40 bg-agent-devops/10 text-agent-devops",
  },
};

/** Returns the pure persona data without CSS classes — safe for server/orchestration code. */
export function getPersonaBase(role: AgentRole): AgentPersonaBase {
  return BASE_PERSONAS[role];
}

/** Returns the full persona with CSS accent classes — for UI rendering only. */
export function getPersona(role: AgentRole): AgentPersona {
  return AGENT_PERSONAS[role];
}
