import type { SimulationAgentRole } from "@/ai/agents/config";

export type TeamTemplateId = "software" | "physical" | "hybrid";

export interface TeamTemplate {
  id: TeamTemplateId;
  slotTitles: Record<SimulationAgentRole, string>;
}

const softwareTemplate: TeamTemplate = {
  id: "software",
  slotTitles: {
    pm: "Product Manager",
    architect: "Architect",
    backend: "Backend Developer",
    frontend: "Frontend Developer",
    devops: "DevOps Engineer",
    reviewer: "Reviewer",
  },
};

const physicalTemplate: TeamTemplate = {
  id: "physical",
  slotTitles: {
    pm: "Chef de projet travaux",
    architect: "Ingénieur technique",
    backend: "Expert conformité & réglementation",
    frontend: "Planning, budget & risques",
    devops: "Exploitation & déploiement chantier",
    reviewer: "Reviewer",
  },
};

const hybridTemplate: TeamTemplate = {
  id: "hybrid",
  slotTitles: {
    pm: "Product Manager",
    architect: "Software Architect",
    backend: "Expert métier / conformité",
    frontend: "Planning d'intégration",
    devops: "DevOps / Platform Engineer",
    reviewer: "Reviewer",
  },
};

const TEAM_TEMPLATES: Record<TeamTemplateId, TeamTemplate> = {
  software: softwareTemplate,
  physical: physicalTemplate,
  hybrid: hybridTemplate,
};

export function getTeamTemplate(templateId: TeamTemplateId): TeamTemplate {
  return TEAM_TEMPLATES[templateId];
}

export function isTeamTemplateId(value: unknown): value is TeamTemplateId {
  return value === "software" || value === "physical" || value === "hybrid";
}
