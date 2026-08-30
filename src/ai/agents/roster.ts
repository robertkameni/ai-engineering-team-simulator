import {
  SIMULATION_AGENT_ORDER,
  type SimulationAgentRole,
} from "@/ai/agents/config";
import {
  getTeamTemplate,
  type TeamTemplateId,
} from "@/ai/agents/team-templates";
import { AGENT_PERSONAS } from "@/lib/agents/personas";

const FIRST_NAMES = [
  "Alex",
  "Avery",
  "Blake",
  "Cameron",
  "Casey",
  "Dana",
  "Elena",
  "Harper",
  "Jordan",
  "Kai",
  "Logan",
  "Marcus",
  "Morgan",
  "Noah",
  "Priya",
  "Quinn",
  "Riley",
  "Sam",
  "Taylor",
  "Robin",
  "Sage",
  "Skyler",
  "Reese",
  "Nico",
  "Jamie",
] as const;

export interface TeamMember {
  role: SimulationAgentRole;
  name: string;
  title: string;
  initials: string;
}

export type TeamRoster = {
  templateId: TeamTemplateId;
} & Record<SimulationAgentRole, TeamMember>;

function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickNames(count: number): string[] {
  if (count > FIRST_NAMES.length) {
    throw new Error("Not enough names in pool for team roster");
  }
  return shuffle(FIRST_NAMES).slice(0, count);
}

/** Random display names per simulation run; titles come from the team template. */
export function createSimulationRoster(
  templateId: TeamTemplateId = "software",
): TeamRoster {
  const teamTemplate = getTeamTemplate(templateId);
  const names = pickNames(SIMULATION_AGENT_ORDER.length);
  const roster = { templateId } as TeamRoster;

  SIMULATION_AGENT_ORDER.forEach((role, index) => {
    const persona = AGENT_PERSONAS[role];
    roster[role] = {
      role,
      name: names[index]!,
      title: teamTemplate.slotTitles[role],
      initials: persona.initials,
    };
  });

  return roster;
}

export function getTeamMember(
  roster: TeamRoster,
  role: SimulationAgentRole,
): TeamMember {
  return roster[role];
}

export function formatTeammateNames(roster: TeamRoster): string {
  return SIMULATION_AGENT_ORDER.map((role) => roster[role].name).join(", ");
}