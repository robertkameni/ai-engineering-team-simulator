import type { Message } from "@/generated/prisma/client";

import type { TeamRoster } from "@/ai/agents/roster";
import type { SimulationAgentRole } from "@/ai/agents/config";
import type { AgentRole, SimulationMessage } from "@/features/agents/types";
import { getPersona } from "@/features/agents/personas";
import { prisma } from "@/lib/prisma";
import { toAppRunStatus, toPrismaRunStatus } from "@/lib/db/run-status";
import type { RunStatus as AppRunStatus } from "@/features/agents/types";
import { getOrCreateDefaultProject } from "@/lib/db/projects";
import {
  getMemberFromRoster,
  getTeamRoster,
  parseTeamRoster,
} from "@/lib/db/team-roster";

export async function createRun(userPrompt: string, projectId?: string) {
  const project =
    projectId != null
      ? await prisma.project.findUniqueOrThrow({ where: { id: projectId } })
      : await getOrCreateDefaultProject();

  return prisma.run.create({
    data: {
      projectId: project.id,
      userPrompt,
      status: "RUNNING",
    },
  });
}

export async function updateRunStatus(runId: string, status: AppRunStatus) {
  return prisma.run.update({
    where: { id: runId },
    data: { status: toPrismaRunStatus(status) },
  });
}

export async function updateRunSummary(runId: string, summary: string) {
  return prisma.run.update({
    where: { id: runId },
    data: { summary },
  });
}

export async function appendMessage(
  runId: string,
  agentRole: AgentRole,
  content: string,
  order: number,
  agentName?: string,
) {
  return prisma.message.create({
    data: {
      runId,
      agentRole,
      agentName,
      content,
      order,
    },
  });
}

export async function getRunWithMessages(runId: string) {
  return prisma.run.findUnique({
    where: { id: runId },
    include: {
      messages: { orderBy: { order: "asc" } },
      artifacts: true,
    },
  });
}

export async function listRecentRuns(limit = 10) {
  return prisma.run.findMany({
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      messages: {
        orderBy: { order: "asc" },
        take: 1,
      },
    },
  });
}

export function mapDbMessagesToSimulation(
  messages: Message[],
  roster?: TeamRoster | null,
): SimulationMessage[] {
  return messages.map((message) => {
    const role = message.agentRole as AgentRole;
    const simulationRole = role as SimulationAgentRole;
    const rosterMember = roster
      ? getMemberFromRoster(roster, simulationRole)
      : null;
    const persona = getPersona(role);
    const agentName =
      message.agentName ?? rosterMember?.name ?? persona.name;
    const agentTitle = rosterMember?.title ?? persona.title;

    return {
      id: message.id,
      role,
      agentName,
      agentTitle,
      content: message.content,
      createdAt: message.createdAt.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  });
}

export async function getRunForWorkspace(runId: string) {
  const run = await getRunWithMessages(runId);
  if (!run) return null;

  const rosterFromArtifact = run.artifacts.find(
    (artifact) => artifact.type === "team-roster",
  );
  const roster =
    parseTeamRoster(rosterFromArtifact?.data) ?? (await getTeamRoster(runId));

  const title =
    run.userPrompt.length > 48
      ? `${run.userPrompt.slice(0, 48).trim()}…`
      : run.userPrompt;

  return {
    id: run.id,
    title,
    userPrompt: run.userPrompt,
    status: toAppRunStatus(run.status),
    updatedAt: run.updatedAt.toISOString(),
    messages: mapDbMessagesToSimulation(run.messages, roster),
  };
}
