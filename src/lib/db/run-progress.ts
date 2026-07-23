import "server-only";

import type { RunOwnershipScope } from "@/lib/auth/run-ownership";
import type { RunStatus as AppRunStatus } from "@/features/agents/types";
import { toAppArtifactStatus } from "@/lib/db/artifact-status";
import { buildRunOwnershipWhere } from "@/lib/db/run-ownership-where";
import { toAppRunStatus } from "@/lib/db/run-status";
import { prisma } from "@/lib/prisma";

/** Truncate last-message preview so progress polls stay small. */
const RUN_PROGRESS_LAST_MESSAGE_MAX_CHARS = 240;

export type RunProgressSnapshot = {
  readonly status: AppRunStatus;
  readonly messageCount: number;
  readonly lastMessageText: string;
  readonly artifactsComplete: boolean;
};

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
