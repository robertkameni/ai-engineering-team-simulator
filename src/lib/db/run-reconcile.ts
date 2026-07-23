import {
  isLegacyUntaggedReviewerCompletion,
  getMaxSimulationTurns,
  parseReviewerDecision,
} from "@/ai/orchestration/reviewer-decision";
import type {
  ArtifactStatus as PrismaArtifactStatus,
  RunStatus as PrismaRunStatus,
} from "@/generated/prisma/client";

import {
  toAppArtifactStatus,
  updateArtifactStatus,
} from "@/lib/db/artifact-status";
import { toAppRunStatus, toPrismaRunStatus } from "@/lib/db/run-status";
import type { RunStatus as AppRunStatus } from "@/features/agents/types";
import { prisma } from "@/lib/prisma";

/** Simulate route maxDuration (600s) + buffer for stale detection. */
const RUN_STALE_MS = 12 * 60 * 1000;

async function finalizeStaleRunFromLastMessage(params: {
  readonly runId: string;
  readonly messageCount: number;
  readonly artifactStatus: PrismaArtifactStatus;
  readonly lastMessage: { agentRole: string; content: string; };
}): Promise<void> {
  const debateComplete = resolveStaleDebateCompletion(
    params.messageCount,
    params.lastMessage,
  );
  const artifactStatus = toAppArtifactStatus(params.artifactStatus);

  if (debateComplete) {
    await setRunStatus(params.runId, "complete");
    if (
      artifactStatus === "generating" ||
      artifactStatus === "pending" ||
      artifactStatus === "none"
    ) {
      await updateArtifactStatus(params.runId, "failed");
    }
    return;
  }

  await setRunStatus(params.runId, "failed");
}

export async function reconcileRunFailure(
  runId: string,
  options: { debateComplete: boolean; artifactPhaseStarted: boolean; },
) {
  if (options.debateComplete && options.artifactPhaseStarted) {
    await updateArtifactStatus(runId, "failed");
    await setRunStatus(runId, "complete");
    return;
  }
  await setRunStatus(runId, "failed");
}

export async function reconcileStaleRunIfNeeded(run: {
  id: string;
  status: PrismaRunStatus;
  artifactStatus: PrismaArtifactStatus;
  updatedAt: Date;
  messageCount: number;
  lastMessage?: { agentRole: string; content: string; } | null;
}): Promise<boolean> {
  if (toAppRunStatus(run.status) !== "running") {
    return false;
  }

  if (Date.now() - run.updatedAt.getTime() <= RUN_STALE_MS) {
    return false;
  }

  if (run.messageCount === 0) {
    await setRunStatus(run.id, "failed");
    return true;
  }

  const lastMessage =
    run.lastMessage ??
    (await prisma.message.findFirst({
      where: { runId: run.id },
      orderBy: { order: "desc" },
      select: { agentRole: true, content: true },
    }));

  if (!lastMessage) {
    await setRunStatus(run.id, "failed");
    return true;
  }

  await finalizeStaleRunFromLastMessage({
    runId: run.id,
    messageCount: run.messageCount,
    artifactStatus: run.artifactStatus,
    lastMessage,
  });

  return true;
}

interface StaleRunCandidate {
  id: string;
  status: PrismaRunStatus;
  artifactStatus: PrismaArtifactStatus;
  updatedAt: Date;
  messageCount: number;
}

export async function reconcileStaleRunsBatch(
  runs: StaleRunCandidate[],
): Promise<Set<string>> {
  const staleRuns = runs.filter((run) => {
    if (toAppRunStatus(run.status) !== "running") return false;
    return Date.now() - run.updatedAt.getTime() > RUN_STALE_MS;
  });

  if (staleRuns.length === 0) {
    return new Set();
  }

  const staleIds = new Set(staleRuns.map((r) => r.id));

  const zeroMessageRuns = staleRuns.filter((r) => r.messageCount === 0);
  if (zeroMessageRuns.length > 0) {
    await prisma.run.updateMany({
      where: { id: { in: zeroMessageRuns.map((r) => r.id) } },
      data: { status: "FAILED" },
    });
  }

  const runsWithMessages = staleRuns.filter((r) => r.messageCount > 0);
  if (runsWithMessages.length === 0) {
    return staleIds;
  }

  const lastMessages = await prisma.message.findMany({
    where: { runId: { in: runsWithMessages.map((r) => r.id) } },
    orderBy: { order: "desc" },
    select: { runId: true, agentRole: true, content: true },
  });

  const lastMessageByRun = new Map<string, { agentRole: string; content: string; }>();
  for (const msg of lastMessages) {
    if (!lastMessageByRun.has(msg.runId)) {
      lastMessageByRun.set(msg.runId, { agentRole: msg.agentRole, content: msg.content });
    }
  }

  for (const run of runsWithMessages) {
    const lastMessage = lastMessageByRun.get(run.id);

    if (!lastMessage) {
      await setRunStatus(run.id, "failed");
      continue;
    }

    await finalizeStaleRunFromLastMessage({
      runId: run.id,
      messageCount: run.messageCount,
      artifactStatus: run.artifactStatus,
      lastMessage,
    });
  }

  return staleIds;
}

function resolveStaleDebateCompletion(
  messageCount: number,
  lastMessage: { agentRole: string; content: string; },
): boolean {
  if (messageCount >= getMaxSimulationTurns("software")) {
    return true;
  }

  if (lastMessage.agentRole !== "reviewer") {
    return false;
  }

  if (isLegacyUntaggedReviewerCompletion(lastMessage)) {
    return true;
  }

  const { decision } = parseReviewerDecision(lastMessage.content);
  return decision === "approve";
}

async function setRunStatus(runId: string, status: AppRunStatus) {
  return prisma.run.update({
    where: { id: runId },
    data: { status: toPrismaRunStatus(status) },
  });
}
