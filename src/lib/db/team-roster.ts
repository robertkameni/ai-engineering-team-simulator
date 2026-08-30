import type { Prisma } from "@/generated/prisma/client";

import { SIMULATION_AGENT_ORDER, type SimulationAgentRole } from "@/lib/agent-roles";
import type { TeamMember, TeamRoster } from "@/ai/agents/roster";
import { getTeamTemplate, isTeamTemplateId } from "@/ai/agents/team-templates";
import { AGENT_PERSONAS } from "@/lib/agents/personas";
import { prisma } from "@/lib/prisma";

export const TEAM_ROSTER_ARTIFACT_TYPE = "team-roster";

export async function saveTeamRoster(runId: string, roster: TeamRoster) {
  const data = roster as unknown as Prisma.InputJsonValue;

  return prisma.artifact.upsert({
    where: {
      runId_type: {
        runId,
        type: TEAM_ROSTER_ARTIFACT_TYPE,
      },
    },
    create: {
      runId,
      type: TEAM_ROSTER_ARTIFACT_TYPE,
      data,
    },
    update: {
      data,
    },
  });
}

export function parseTeamRoster(data: unknown): TeamRoster | null {
  if (data == null || typeof data !== "object") return null;

  const record = data as Record<string, unknown>;
  const templateId = isTeamTemplateId(record.templateId)
    ? record.templateId
    : "software";

  const roster = { templateId } as TeamRoster;
  let parsedCount = 0;

  for (const role of SIMULATION_AGENT_ORDER) {
    const member = record[role];
    if (
      member != null &&
      typeof member === "object" &&
      typeof (member as TeamMember).name === "string" &&
      typeof (member as TeamMember).title === "string"
    ) {
      roster[role] = member as TeamMember;
      parsedCount += 1;
      continue;
    }

    if (role === "devops" && parsedCount >= 5 && record.pm != null) {
      const template = getTeamTemplate(templateId);
      const persona = AGENT_PERSONAS.devops;
      roster.devops = {
        role: "devops",
        name: persona.name,
        title: template.slotTitles.devops,
        initials: persona.initials,
      };
      continue;
    }

    return null;
  }

  return roster;
}

export async function getTeamRoster(runId: string): Promise<TeamRoster | null> {
  const artifact = await prisma.artifact.findUnique({
    where: {
      runId_type: {
        runId,
        type: TEAM_ROSTER_ARTIFACT_TYPE,
      },
    },
  });

  if (!artifact) return null;
  return parseTeamRoster(artifact.data);
}

export function getMemberFromRoster(
  roster: TeamRoster | null,
  role: SimulationAgentRole,
): TeamMember | null {
  return roster?.[role] ?? null;
}
