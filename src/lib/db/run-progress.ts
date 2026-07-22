import "server-only";

import type { Prisma } from "@/generated/prisma/client";

import type { RunOwnershipScope } from "@/lib/auth/run-ownership";
import type { RunStatus as AppRunStatus } from "@/features/agents/types";
import { toAppArtifactStatus } from "@/lib/db/artifact-status";
import { toAppRunStatus } from "@/lib/db/run-status";
import { prisma } from "@/lib/prisma";

/** Truncate last-message preview so progress polls stay small. */
export const RUN_PROGRESS_LAST_MESSAGE_MAX_CHARS = 240;

export type RunProgressSnapshot = {
  readonly status: AppRunStatus;
  readonly messageCount: number;
  readonly lastMessageText: string;
  readonly artifactsComplete: boolean;
};

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

function truncateProgressText(content: string): string {
  if (content.length <= RUN_PROGRESS_LAST_MESSAGE_MAX_CHARS) {
    return content;
  }
  return content.slice(0, RUN_PROGRESS_LAST_MESSAGE_MAX_CHARS);
}

/**
 * Slim progress for stream-drop recovery polling (arch-review F2).
 * Ownership failures return null so routes can mask as 404.
 */
export async function getRunProgressIfOwned(
  runId: string,
  scope: RunOwnershipScope,
): Promise<RunProgressSnapshot | null> {
  const ownershipWhere = buildRunOwnershipWhere(scope);
  if (ownershipWhere == null) {
    return null;
  }

  const run = await prisma.run.findFirst({
    where: { id: runId, ...ownershipWhere },
    select: {
      status: true,
      artifactStatus: true,
      _count: { select: { messages: true } },
      messages: {
        orderBy: { order: "desc" },
        take: 1,
        select: { content: true },
      },
    },
  });

  if (!run) {
    return null;
  }

  const artifactStatus = toAppArtifactStatus(run.artifactStatus);

  return {
    status: toAppRunStatus(run.status),
    messageCount: run._count.messages,
    lastMessageText: truncateProgressText(run.messages[0]?.content ?? ""),
    artifactsComplete:
      artifactStatus === "ready" || artifactStatus === "failed",
  };
}
