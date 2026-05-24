import type { Prisma } from "@/generated/prisma/client";

import {
  SIMULATION_AGENT_ORDER,
  type SimulationAgentRole,
} from "@/ai/agents/config";
import type { TeamMember, TeamRoster } from "@/ai/agents/roster";
import { isTeamTemplateId } from "@/ai/agents/team-templates";
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

  for (const role of SIMULATION_AGENT_ORDER) {
    const member = record[role];
    if (
      member == null ||
      typeof member !== "object" ||
      typeof (member as TeamMember).name !== "string" ||
      typeof (member as TeamMember).title !== "string"
    ) {
      return null;
    }
    roster[role] = member as TeamMember;
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
