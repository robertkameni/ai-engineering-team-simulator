import type { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/lib/prisma";

export async function upsertArtifact(
  runId: string,
  type: string,
  data: Prisma.InputJsonValue,
) {
  return prisma.artifact.upsert({
    where: {
      runId_type: { runId, type },
    },
    create: { runId, type, data },
    update: { data },
  });
}

export async function getArtifactsForRun(runId: string) {
  return prisma.artifact.findMany({
    where: { runId },
    orderBy: { createdAt: "asc" },
  });
}
