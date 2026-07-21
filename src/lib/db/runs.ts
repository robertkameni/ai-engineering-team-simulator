import type { Prisma } from "@/generated/prisma/client";
import type { Message } from "@/generated/prisma/client";

import type { TeamRoster } from "@/ai/agents/roster";
import { isSimulationAgent, type SimulationAgentRole } from "@/ai/agents/config";
import { parseDebateOutcomeFromRunSummary } from "@/ai/orchestration/reviewer-decision";
import { opsFollowUpFieldsFromCheckpoint } from "@/lib/db/ops-follow-up-summary";
import { parseRunSummary } from "@/lib/db/run-summary";
import type { AgentRole, SimulationMessage } from "@/features/agents/types";
import { getPersonaBase } from "@/features/agents/personas";
import { formatMessageTime, formatRelativeTime } from "@/lib/format-time";
import type { SidebarRunItemData } from "@/features/workspace/sidebar-types";
import type { RunUsageTotals } from "@/lib/ai/run-usage";
import { prisma } from "@/lib/prisma";
import {
  deriveArtifactsPanelStatus,
  toAppArtifactStatus,
} from "@/lib/db/artifact-status";
import { reconcileStaleRunIfNeeded, reconcileStaleRunsBatch } from "@/lib/db/run-reconcile";
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

export async function getRunUsageTotalsById(
  runId: string,
): Promise<RunUsageTotals | null> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: {
      promptTokens: true,
      completionTokens: true,
      totalTokens: true,
      estimatedCostUsd: true,
    },
  });
  if (!run) {
    return null;
  }
  return mapUsageFromRun(run);
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

  // Sequential writes avoid Neon WebSocket pool stalls on `$transaction`
  // ("Unable to start a transaction in the given time") during long debates.
  const message = await prisma.message.create({
    data: {
      runId,
      agentRole,
      agentName,
      content,
      order,
    },
  });

  try {
    await prisma.run.update({
      where: { id: runId },
      data: { updatedAt: now },
    });
  } catch (error) {
    console.warn("appendMessage: failed to touch run updatedAt", {
      runId,
      error,
    });
  }

  return message;
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

function buildRunOwnershipWhere(
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

async function listRecentRuns(
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

  const runs = await prisma.run.findMany(query);

  const runningRuns = runs.filter((run) => run.status === "RUNNING");
  if (runningRuns.length > 0) {
    const reconciledIds = await reconcileStaleRunsBatch(
      runningRuns.map((run) => ({
        id: run.id,
        status: run.status,
        artifactStatus: run.artifactStatus,
        updatedAt: run.updatedAt,
        messageCount: run._count.messages,
      })),
    );

    if (reconciledIds.size > 0) {
      return prisma.run.findMany(query);
    }
  }

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

  const { count } = await prisma.run.deleteMany({ where: { id: runId } });
  return count > 0 ? "deleted" : "not_found";
}

function formatRunTitle(userPrompt: string): string {
  return userPrompt.trim();
}

function mapDbMessagesToSimulation(
  messages: Message[],
  roster?: TeamRoster | null,
): SimulationMessage[] {
  return messages.flatMap((message) => {
    const rawRole = message.agentRole;
    if (!isSimulationAgent(rawRole as AgentRole)) {
      console.warn("Unknown agentRole in DB, skipping message", {
        messageId: message.id,
        rawRole,
      });
      return [];
    }
    const role = rawRole as AgentRole;
    const simulationRole = rawRole as SimulationAgentRole;
    const rosterMember = roster
      ? getMemberFromRoster(roster, simulationRole)
      : null;
    const persona = getPersonaBase(role);
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

function buildOpsFollowUpFromSummary(
  summaryPayload: ReturnType<typeof parseRunSummary>,
) {
  if (!summaryPayload?.opsFollowUpEvaluated) {
    return opsFollowUpFieldsFromCheckpoint(null);
  }

  return opsFollowUpFieldsFromCheckpoint({
    opsFollowUpEvaluated: summaryPayload.opsFollowUpEvaluated,
    opsFollowUpTriggered: summaryPayload.opsFollowUpTriggered ?? false,
    opsFollowUpSkipReason: summaryPayload.opsFollowUpSkipReason ?? null,
    opsFollowUpEligible: summaryPayload.opsFollowUpEligible ?? false,
    opsFollowUpUnresolvedDevopsIssueCount:
      summaryPayload.opsFollowUpUnresolvedDevopsIssueCount ?? 0,
    opsFollowUpOpenIssueCount:
      summaryPayload.opsFollowUpOpenIssueCount ??
      summaryPayload.opsFollowUpUnresolvedDevopsIssueCount ??
      0,
    opsFollowUpAddressedIssueCount: summaryPayload.opsFollowUpAddressedIssueCount ?? 0,
    opsFollowUpAcceptedRiskIssueCount:
      summaryPayload.opsFollowUpAcceptedRiskIssueCount ?? 0,
    opsFollowUpAcceptedRiskReasons:
      summaryPayload.opsFollowUpAcceptedRiskReasons ?? [],
    opsFollowUpLastCorrectionRole:
      summaryPayload.opsFollowUpLastCorrectionRole ?? null,
    opsFollowUpEvaluationTurn:
      summaryPayload.opsFollowUpEvaluationTurn ?? null,
  });
}

function buildUsageWithSummaryTelemetry(
  usage: ReturnType<typeof mapUsageFromRun>,
  summaryPayload: ReturnType<typeof parseRunSummary>,
): ReturnType<typeof mapUsageFromRun> {
  const isUsageMissing =
    usage.usageMissing === true ||
    (usage.totalTokens === 0 && summaryPayload?.debateOutcome != null);

  return {
    ...usage,
    peakPromptTokens: summaryPayload?.peakPromptTokens ?? usage.peakPromptTokens,
    usageMissing: isUsageMissing ? true : usage.usageMissing,
  };
}

function buildSummaryTelemetryFields(
  summaryPayload: ReturnType<typeof parseRunSummary>,
) {
  return {
    postApproveTruncation: summaryPayload?.postApproveTruncation === true,
    postApproveContinuationFailed:
      summaryPayload?.postApproveContinuationFailed === true,
    debateDurationMs: summaryPayload?.debateDurationMs ?? null,
    artifactDurationMs: summaryPayload?.artifactDurationMs ?? null,
    userWaitMs: summaryPayload?.userWaitMs ?? null,
    totalDurationMs: summaryPayload?.totalDurationMs ?? null,
    artifactsPending: summaryPayload?.artifactsPending === true,
    peakPromptTokens: summaryPayload?.peakPromptTokens ?? null,
    stackValidationFailed: summaryPayload?.stackValidationFailed === true,
    crossValidationFailed: summaryPayload?.crossValidationFailed === true,
    opsFollowUpArchitectCheckpoint:
      summaryPayload?.opsFollowUpArchitectCheckpoint ?? null,
    finalization: summaryPayload?.finalization ?? null,
  };
}

async function mapRunToWorkspace(run: RunWithMessagesAndArtifacts) {
  const rosterFromArtifact = run.artifacts.find(
    (artifact) => artifact.type === "team-roster",
  );
  const roster =
    parseTeamRoster(rosterFromArtifact?.data) ??
    (await getTeamRoster(run.id));

  const runStatus = toAppRunStatus(run.status);
  const artifactStatus = toAppArtifactStatus(run.artifactStatus);
  const summaryPayload = parseRunSummary(run.summary);

  return {
    id: run.id,
    title: formatRunTitle(run.userPrompt),
    userPrompt: run.userPrompt,
    status: runStatus,
    updatedAt: run.updatedAt.toISOString(),
    userId: run.userId,
    usage: buildUsageWithSummaryTelemetry(mapUsageFromRun(run), summaryPayload),
    messages: mapDbMessagesToSimulation(run.messages, roster),
    artifacts: mapDbArtifactsToRunArtifacts(run.artifacts),
    artifactsStatus: deriveArtifactsPanelStatus(runStatus, artifactStatus),
    debateOutcome: parseDebateOutcomeFromRunSummary(run.summary),
    ...buildSummaryTelemetryFields(summaryPayload),
    ...buildOpsFollowUpFromSummary(summaryPayload),
  };
}

async function getRunForWorkspace(runId: string) {
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
