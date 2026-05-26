import type { Prisma } from "@/generated/prisma/client";
import type { Message } from "@/generated/prisma/client";

import type { TeamRoster } from "@/ai/agents/roster";
import type { SimulationAgentRole } from "@/ai/agents/config";
import { parseDebateOutcomeFromRunSummary } from "@/ai/orchestration/reviewer-decision";
import type { AgentRole, SimulationMessage } from "@/features/agents/types";
import { getPersona } from "@/features/agents/personas";
import { formatMessageTime, formatRelativeTime } from "@/lib/format-time";
import type { SidebarRunItemData } from "@/features/workspace/sidebar-types";
import type { RunUsageTotals } from "@/lib/ai/run-usage";
import { prisma } from "@/lib/prisma";
import {
  deriveArtifactsPanelStatus,
  toAppArtifactStatus,
} from "@/lib/db/artifact-status";
import { reconcileStaleRunIfNeeded } from "@/lib/db/run-reconcile";
import { toAppRunStatus, toPrismaRunStatus } from "@/lib/db/run-status";
import type { RunStatus as AppRunStatus } from "@/features/agents/types";
import { getOrCreateDefaultProject } from "@/lib/db/projects";
import { mapDbArtifactsToRunArtifacts } from "@/lib/db/artifacts";
import {
  getMemberFromRoster,
  getTeamRoster,
  parseTeamRoster,
} from "@/lib/db/team-roster";
import type { RunOwnershipScope } from "@/lib/auth/run-ownership";

export type { RunOwnershipScope };

export interface CreateRunOptions {
  projectId?: string;
  userId?: string | null;
  guestSessionId?: string | null;
}

function mapUsageFromRun(run: {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: Prisma.Decimal | null;
}): RunUsageTotals {
  return {
    promptTokens: run.promptTokens,
    completionTokens: run.completionTokens,
    totalTokens: run.totalTokens,
    estimatedCostUsd:
      run.estimatedCostUsd != null ? Number(run.estimatedCostUsd) : 0,
  };
}

export async function createRun(
  userPrompt: string,
  options: CreateRunOptions = {},
) {
  const project =
    options.projectId != null
      ? await prisma.project.findUniqueOrThrow({
          where: { id: options.projectId },
        })
      : await getOrCreateDefaultProject();

  return prisma.run.create({
    data: {
      projectId: project.id,
      userPrompt,
      userId: options.userId ?? null,
      guestSessionId:
        options.userId != null ? null : (options.guestSessionId ?? null),
      status: "RUNNING",
    },
  });
}

export async function setRunUsageTotals(
  runId: string,
  totals: RunUsageTotals,
): Promise<void> {
  await prisma.run.update({
    where: { id: runId },
    data: {
      promptTokens: totals.promptTokens,
      completionTokens: totals.completionTokens,
      totalTokens: totals.totalTokens,
      estimatedCostUsd: totals.estimatedCostUsd,
    },
  });
}

export async function updateRunStatus(runId: string, status: AppRunStatus) {
  return prisma.run.update({
    where: { id: runId },
    data: { status: toPrismaRunStatus(status) },
  });
}

export async function touchRunActivity(runId: string) {
  return prisma.run.update({
    where: { id: runId },
    data: { updatedAt: new Date() },
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
  const now = new Date();

  return prisma.$transaction([
    prisma.message.create({
      data: {
        runId,
        agentRole,
        agentName,
        content,
        order,
      },
    }),
    prisma.run.update({
      where: { id: runId },
      data: { updatedAt: now },
    }),
  ]);
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

export function buildRunOwnershipWhere(
  scope: RunOwnershipScope,
): Prisma.RunWhereInput | null {
  const conditions: Prisma.RunWhereInput[] = [];

  if (scope.userId != null) {
    conditions.push({ userId: scope.userId });
  }

  if (scope.guestSessionId != null) {
    conditions.push({
      guestSessionId: scope.guestSessionId,
      userId: null,
    });
  }

  if (conditions.length === 0) {
    return null;
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return { OR: conditions };
}

export function canAccessRun(
  run: { userId: string | null; guestSessionId: string | null },
  scope: RunOwnershipScope,
): boolean {
  if (scope.userId != null && run.userId === scope.userId) {
    return true;
  }

  if (
    scope.guestSessionId != null &&
    run.userId === null &&
    run.guestSessionId === scope.guestSessionId
  ) {
    return true;
  }

  return false;
}

export async function listRecentRuns(
  scope: RunOwnershipScope,
  limit = 10,
) {
  const where = buildRunOwnershipWhere(scope);
  if (where == null) {
    return [];
  }

  const query = {
    where,
    orderBy: { updatedAt: "desc" as const },
    take: limit,
    include: {
      _count: { select: { messages: true } },
      messages: {
        orderBy: { order: "asc" as const },
        take: 1,
      },
    },
  };

  let runs = await prisma.run.findMany(query);

  await Promise.all(
    runs
      .filter((run) => run.status === "RUNNING")
      .map((run) =>
        reconcileStaleRunIfNeeded({
          id: run.id,
          status: run.status,
          artifactStatus: run.artifactStatus,
          updatedAt: run.updatedAt,
          messageCount: run._count.messages,
        }),
      ),
  );

  runs = await prisma.run.findMany(query);

  return runs;
}

export async function listRecentRunsForSidebar(
  scope: RunOwnershipScope,
  limit = 12,
): Promise<SidebarRunItemData[]> {
  const runs = await listRecentRuns(scope, limit);
  return runs.map((run) => ({
    id: run.id,
    title: formatRunTitle(run.userPrompt),
    status: toAppRunStatus(run.status),
    updatedAt: formatRelativeTime(run.updatedAt),
  }));
}

export type DeleteRunIfOwnedResult = "deleted" | "not_found" | "forbidden";

export async function deleteRunIfOwned(
  runId: string,
  scope: RunOwnershipScope,
): Promise<DeleteRunIfOwnedResult> {
  const existing = await prisma.run.findUnique({
    where: { id: runId },
    select: { id: true, userId: true, guestSessionId: true },
  });

  if (!existing) {
    return "not_found";
  }

  if (!canAccessRun(existing, scope)) {
    return "forbidden";
  }

  await prisma.run.delete({ where: { id: runId } });
  return "deleted";
}

export function formatRunTitle(userPrompt: string): string {
  return userPrompt.trim();
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
      createdAt: formatMessageTime(message.createdAt),
    };
  });
}

type RunWithMessagesAndArtifacts = NonNullable<
  Awaited<ReturnType<typeof getRunWithMessages>>
>;

const runMessagesArtifactsInclude = {
  messages: { orderBy: { order: "asc" as const } },
  artifacts: true,
} satisfies Prisma.RunInclude;

async function refreshRunAfterReconcile(
  runId: string,
  run: RunWithMessagesAndArtifacts,
): Promise<RunWithMessagesAndArtifacts | null> {
  const reconciled = await reconcileStaleRunIfNeeded({
    id: run.id,
    status: run.status,
    artifactStatus: run.artifactStatus,
    updatedAt: run.updatedAt,
    messageCount: run.messages.length,
  });
  if (!reconciled) {
    return run;
  }
  return getRunWithMessages(runId);
}

async function mapRunToWorkspace(run: RunWithMessagesAndArtifacts) {
  const rosterFromArtifact = run.artifacts.find(
    (artifact) => artifact.type === "team-roster",
  );
  const roster =
    parseTeamRoster(rosterFromArtifact?.data) ??
    (await getTeamRoster(run.id));

  const title = formatRunTitle(run.userPrompt);

  const artifacts = mapDbArtifactsToRunArtifacts(run.artifacts);
  const runStatus = toAppRunStatus(run.status);
  const artifactStatus = toAppArtifactStatus(run.artifactStatus);
  const artifactsStatus = deriveArtifactsPanelStatus(runStatus, artifactStatus);

  return {
    id: run.id,
    title,
    userPrompt: run.userPrompt,
    status: runStatus,
    updatedAt: run.updatedAt.toISOString(),
    userId: run.userId,
    usage: mapUsageFromRun(run),
    messages: mapDbMessagesToSimulation(run.messages, roster),
    artifacts,
    artifactsStatus,
    debateOutcome: parseDebateOutcomeFromRunSummary(run.summary),
  };
}

export async function getRunForWorkspace(runId: string) {
  let run = await getRunWithMessages(runId);
  if (!run) return null;

  run = await refreshRunAfterReconcile(runId, run);
  if (!run) return null;

  return mapRunToWorkspace(run);
}

export async function getRunForWorkspaceIfOwned(
  runId: string,
  scope: RunOwnershipScope,
) {
  let run = await getRunWithMessages(runId);
  if (!run) return null;

  if (
    !canAccessRun(
      { userId: run.userId, guestSessionId: run.guestSessionId },
      scope,
    )
  ) {
    return null;
  }

  run = await refreshRunAfterReconcile(runId, run);
  if (!run) return null;

  return mapRunToWorkspace(run);
}

export async function getRunForArtifactsIfOwned(
  runId: string,
  scope: RunOwnershipScope,
) {
  const ownershipWhere = buildRunOwnershipWhere(scope);
  if (ownershipWhere == null) {
    return null;
  }

  const scopedWhere: Prisma.RunWhereInput = {
    id: runId,
    ...ownershipWhere,
  };

  const fetchScoped = () =>
    prisma.run.findFirst({
      where: scopedWhere,
      include: runMessagesArtifactsInclude,
    });

  const run = await fetchScoped();
  if (!run) return null;

  const reconciled = await reconcileStaleRunIfNeeded({
    id: run.id,
    status: run.status,
    artifactStatus: run.artifactStatus,
    updatedAt: run.updatedAt,
    messageCount: run.messages.length,
  });

  if (!reconciled) {
    return run;
  }

  const refreshed = await fetchScoped();
  if (!refreshed) {
    console.warn("Artifacts lookup: run missing after stale reconcile", {
      runId,
    });
    return run;
  }

  return refreshed;
}
