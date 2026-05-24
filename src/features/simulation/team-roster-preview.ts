import { SIMULATION_AGENT_ORDER, type SimulationAgentRole } from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";
import type { TeamTemplateId } from "@/ai/agents/team-templates";

export interface TeamRosterMemberPreview {
  role: SimulationAgentRole;
  name: string;
  title: string;
}

export interface TeamRosterPreview {
  templateId: TeamTemplateId;
  members: TeamRosterMemberPreview[];
}

export function teamMemberPreview(
  roster: TeamRosterPreview | null | undefined,
  role: SimulationAgentRole,
): TeamRosterMemberPreview | undefined {
  return roster?.members.find((member) => member.role === role);
}

export function rosterToPreview(roster: TeamRoster): TeamRosterPreview {
  return {
    templateId: roster.templateId,
    members: SIMULATION_AGENT_ORDER.map((role) => ({
      role,
      name: roster[role].name,
      title: roster[role].title,
    })),
  };
}
