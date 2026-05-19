import "server-only";

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/generated/prisma/client";

/** Bump when the Prisma schema changes so `next dev` drops a stale cached client. */
const PRISMA_CLIENT_EPOCH = "2026-05-20-agentName";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaEpoch?: string;
};

if (
  process.env.NODE_ENV !== "production" &&
  globalForPrisma.prismaEpoch !== PRISMA_CLIENT_EPOCH
) {
  globalForPrisma.prisma = undefined;
  globalForPrisma.prismaEpoch = PRISMA_CLIENT_EPOCH;
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
