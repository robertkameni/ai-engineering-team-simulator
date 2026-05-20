import type { AgentPersona, AgentRole } from "@/features/agents/types";

export const AGENT_PERSONAS: Record<AgentRole, AgentPersona> = {
  pm: {
    role: "pm",
    name: "Morgan",
    title: "Product Manager",
    initials: "PM",
    accentClass: "text-agent-pm",
    borderClass: "border-l-agent-pm",
    badgeClass:
      "border-agent-pm/40 bg-agent-pm/10 text-agent-pm",
  },
  architect: {
    role: "architect",
    name: "Alex",
    title: "Architect",
    initials: "AR",
    accentClass: "text-agent-architect",
    borderClass: "border-l-agent-architect",
    badgeClass:
      "border-agent-architect/40 bg-agent-architect/10 text-agent-architect",
  },
  frontend: {
    role: "frontend",
    name: "Jordan",
    title: "Frontend Developer",
    initials: "FE",
    accentClass: "text-agent-frontend",
    borderClass: "border-l-agent-frontend",
    badgeClass:
      "border-agent-frontend/40 bg-agent-frontend/10 text-agent-frontend",
  },
  backend: {
    role: "backend",
    name: "Riley",
    title: "Backend Developer",
    initials: "BE",
    accentClass: "text-agent-backend",
    borderClass: "border-l-agent-backend",
    badgeClass:
      "border-agent-backend/40 bg-agent-backend/10 text-agent-backend",
  },
  reviewer: {
    role: "reviewer",
    name: "Sam",
    title: "Reviewer",
    initials: "RV",
    accentClass: "text-agent-reviewer",
    borderClass: "border-l-agent-reviewer",
    badgeClass:
      "border-agent-reviewer/40 bg-agent-reviewer/10 text-agent-reviewer",
  },
  devops: {
    role: "devops",
    name: "Casey",
    title: "DevOps",
    initials: "DO",
    accentClass: "text-agent-devops",
    borderClass: "border-l-agent-devops",
    badgeClass:
      "border-agent-devops/40 bg-agent-devops/10 text-agent-devops",
  },
};

export function getPersona(role: AgentRole): AgentPersona {
  return AGENT_PERSONAS[role];
}

export function getPersonaWithName(
  role: AgentRole,
  name: string,
  title?: string,
): AgentPersona {
  const base = AGENT_PERSONAS[role];
  return {
    ...base,
    name,
    title: title ?? base.title,
  };
}
