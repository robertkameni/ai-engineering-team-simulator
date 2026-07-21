import { PrismaNeon } from "@prisma/adapter-neon";

import { isDebateComplete } from "../src/ai/orchestration/reviewer-decision";
import { PrismaClient } from "../src/generated/prisma/client";

async function main(): Promise<void> {
  const runId = process.argv[2] ?? "cmruys7d4000h74tvis67xo1t";
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL missing");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });

  try {
    const messages = await prisma.message.findMany({
      where: { runId },
      orderBy: { order: "asc" },
      select: { agentRole: true, content: true, order: true },
    });

    const last = messages[messages.length - 1];
    const complete = isDebateComplete(
      messages.map((message) => ({
        agentRole: message.agentRole,
        content: message.content,
      })),
    );

    console.log(
      JSON.stringify(
        {
          runId,
          count: messages.length,
          roles: messages.map((message) => message.agentRole),
          lastRole: last?.agentRole ?? null,
          lastTail: last?.content.slice(-300) ?? null,
          isDebateComplete: complete,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
