import type { Message } from "@/generated/prisma/client";

import type { AgentRole, SimulationMessage } from "@/features/agents/types";
import { prisma } from "@/lib/prisma";
import { toAppRunStatus, toPrismaRunStatus } from "@/lib/db/run-status";
import type { RunStatus as AppRunStatus } from "@/features/agents/types";
import { getOrCreateDefaultProject } from "@/lib/db/projects";

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
) {
  return prisma.message.create({
    data: {
      runId,
      agentRole,
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
): SimulationMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.agentRole as AgentRole,
    content: message.content,
    createdAt: message.createdAt.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));
}

export async function getRunForWorkspace(runId: string) {
  const run = await getRunWithMessages(runId);
  if (!run) return null;

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
    messages: mapDbMessagesToSimulation(run.messages),
  };
}
