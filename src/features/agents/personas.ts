import type { AgentPersona, AgentRole } from "@/features/agents/types";

export const AGENT_PERSONAS: Record<AgentRole, AgentPersona> = {
  pm: {
    role: "pm",
    name: "Morgan",
    title: "Product Manager",
    initials: "PM",
    accentClass: "text-agent-pm",
    borderClass: "border-l-agent-pm",
  },
  architect: {
    role: "architect",
    name: "Alex",
    title: "Architect",
    initials: "AR",
    accentClass: "text-agent-architect",
    borderClass: "border-l-agent-architect",
  },
  frontend: {
    role: "frontend",
    name: "Jordan",
    title: "Frontend Developer",
    initials: "FE",
    accentClass: "text-agent-frontend",
    borderClass: "border-l-agent-frontend",
  },
  backend: {
    role: "backend",
    name: "Riley",
    title: "Backend Developer",
    initials: "BE",
    accentClass: "text-agent-backend",
    borderClass: "border-l-agent-backend",
  },
  reviewer: {
    role: "reviewer",
    name: "Sam",
    title: "Reviewer",
    initials: "RV",
    accentClass: "text-agent-reviewer",
    borderClass: "border-l-agent-reviewer",
  },
  devops: {
    role: "devops",
    name: "Casey",
    title: "DevOps",
    initials: "DO",
    accentClass: "text-agent-devops",
    borderClass: "border-l-agent-devops",
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
