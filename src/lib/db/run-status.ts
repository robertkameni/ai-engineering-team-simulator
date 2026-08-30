import type { RunStatus as PrismaRunStatus } from "@/generated/prisma/client";

import type { RunStatus as AppRunStatus } from "@/lib/types";

const TO_APP: Record<PrismaRunStatus, AppRunStatus> = {
  IDLE: "idle",
  RUNNING: "running",
  COMPLETE: "complete",
  FAILED: "failed",
};

const TO_PRISMA: Record<AppRunStatus, PrismaRunStatus> = {
  idle: "IDLE",
  running: "RUNNING",
  complete: "COMPLETE",
  failed: "FAILED",
};

export function toAppRunStatus(status: PrismaRunStatus): AppRunStatus {
  return TO_APP[status];
}

export function toPrismaRunStatus(status: AppRunStatus): PrismaRunStatus {
  return TO_PRISMA[status];
}
