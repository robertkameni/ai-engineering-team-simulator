import type { ArtifactStatus as PrismaArtifactStatus } from "@/generated/prisma/client";

import { deriveArtifactsPanelStatus } from "@/lib/artifacts-panel-status";
import { prisma } from "@/lib/prisma";

export { deriveArtifactsPanelStatus };

export type AppArtifactStatus =
  | "none"
  | "pending"
  | "generating"
  | "ready"
  | "failed";

const TO_APP: Record<PrismaArtifactStatus, AppArtifactStatus> = {
  NONE: "none",
  PENDING: "pending",
  GENERATING: "generating",
  READY: "ready",
  FAILED: "failed",
};

const TO_PRISMA: Record<AppArtifactStatus, PrismaArtifactStatus> = {
  none: "NONE",
  pending: "PENDING",
  generating: "GENERATING",
  ready: "READY",
  failed: "FAILED",
};

export function toAppArtifactStatus(
  status: PrismaArtifactStatus,
): AppArtifactStatus {
  return TO_APP[status];
}

export function toPrismaArtifactStatus(
  status: AppArtifactStatus,
): PrismaArtifactStatus {
  return TO_PRISMA[status];
}

export async function updateArtifactStatus(
  runId: string,
  status: AppArtifactStatus,
) {
  return prisma.run.update({
    where: { id: runId },
    data: { artifactStatus: toPrismaArtifactStatus(status) },
  });
}

/** Atomically transition to GENERATING; returns false if already generating. */
export async function claimArtifactGeneration(runId: string): Promise<boolean> {
  const result = await prisma.run.updateMany({
    where: {
      id: runId,
      artifactStatus: { not: "GENERATING" },
    },
    data: { artifactStatus: "GENERATING" },
  });

  return result.count === 1;
}
