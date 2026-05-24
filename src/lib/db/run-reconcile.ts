import { isDebateComplete } from "@/ai/orchestration/reviewer-decision";
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

/** Simulate route maxDuration (300s) + buffer for stale detection. */
export const RUN_STALE_MS = 6 * 60 * 1000;

export async function reconcileRunFailure(
  runId: string,
  options: { debateComplete: boolean; artifactPhaseStarted: boolean },
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
}): Promise<boolean> {
  if (toAppRunStatus(run.status) !== "running") {
    return false;
  }

  if (Date.now() - run.updatedAt.getTime() <= RUN_STALE_MS) {
    return false;
  }

  const messages = await prisma.message.findMany({
    where: { runId: run.id },
    orderBy: { order: "asc" },
    select: { agentRole: true, content: true },
  });

  const debateComplete = isDebateComplete(messages);
  const artifactStatus = toAppArtifactStatus(run.artifactStatus);

  if (debateComplete) {
    await setRunStatus(run.id, "complete");
    if (
      artifactStatus === "generating" ||
      artifactStatus === "pending" ||
      artifactStatus === "none"
    ) {
      await updateArtifactStatus(run.id, "failed");
    }
  } else {
    await setRunStatus(run.id, "failed");
  }

  return true;
}

async function setRunStatus(runId: string, status: AppRunStatus) {
  return prisma.run.update({
    where: { id: runId },
    data: { status: toPrismaRunStatus(status) },
  });
}
