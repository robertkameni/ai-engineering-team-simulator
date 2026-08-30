/**
 * Print one run's messages. Usage:
 * npx tsx --env-file=.env.local scripts/dump-run-messages.ts <runId> [role]
 */
import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "../src/generated/prisma/client";

const runId = process.argv[2]?.trim();
const roleFilter = process.argv[3]?.trim();
if (!runId) {
  console.error("Usage: npx tsx --env-file=.env.local scripts/dump-run-messages.ts <runId> [role]");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });

  try {
    const messages = await prisma.message.findMany({
      where: { runId, ...(roleFilter ? { agentRole: roleFilter } : {}) },
      orderBy: { order: "asc" },
      select: { order: true, agentRole: true, agentName: true, content: true },
    });
    for (const message of messages) {
      console.log(`\n===== ${message.order} ${message.agentName} (${message.agentRole}) =====\n`);
      console.log(message.content);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
