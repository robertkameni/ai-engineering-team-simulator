/**
 * Load a saved run and print schedule, critique matrix, dump headings, and API surface.
 * Usage: npx tsx --env-file=.env.local scripts/analyze-run-transcript.ts <runId>
 */
import { PrismaNeon } from "@prisma/adapter-neon";

import { createSimulationRoster } from "../src/ai/agents/roster";
import { extractDeclaredApiSurface } from "../src/ai/context/api-surface";
import type { TranscriptEntry } from "../src/ai/context/transcript";
import { buildCritiqueMatrix } from "../src/ai/orchestration/peer-criticism-detector";
import { PrismaClient } from "../src/generated/prisma/client";

const runId = process.argv[2]?.trim();
if (!runId) {
  console.error("Usage: npx tsx --env-file=.env.local scripts/analyze-run-transcript.ts <runId>");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const DUMP_HEADING = /^#{1,3}\s+.*\b(bottleneck|risk|issue)s?\b.*$/gim;

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: connectionString! }),
  });

  try {
    const run = await prisma.run.findUnique({
      where: { id: runId },
      select: {
        id: true,
        userPrompt: true,
        summary: true,
        messages: {
          orderBy: { order: "asc" },
          select: { agentRole: true, agentName: true, content: true, order: true },
        },
      },
    });
    if (!run) {
      console.error(JSON.stringify({ error: "run not found", runId }));
      process.exit(1);
    }

    const summary = run.summary ? (JSON.parse(run.summary) as Record<string, unknown>) : null;
    const transcript: TranscriptEntry[] = run.messages.map((message) => ({
      role: message.agentRole as TranscriptEntry["role"],
      agentName: message.agentName ?? message.agentRole,
      content: message.content,
    }));

    const roster = createSimulationRoster("software");
    for (const message of run.messages) {
      const role = message.agentRole as keyof typeof roster;
      if (roster[role] && message.agentName) {
        roster[role] = { ...roster[role], name: message.agentName };
      }
    }

    const roles = run.messages.map((message) => message.agentRole);
    const consecutiveSameRole = roles.some(
      (role, index) => index > 0 && role === roles[index - 1],
    );
    const matrix = buildCritiqueMatrix(transcript, roster);
    const surface = extractDeclaredApiSurface(transcript);
    const dumpHeadingCounts = run.messages.map((message) => ({
      order: message.order,
      role: message.agentRole,
      dumpHeadings: message.content.match(DUMP_HEADING) ?? [],
    }));

    console.log(
      JSON.stringify(
        {
          runId: run.id,
          prompt: run.userPrompt,
          roles,
          consecutiveSameRole,
          turnCount: summary?.turnCount ?? roles.length,
          debateOutcome: summary?.debateOutcome ?? null,
          finalization: summary?.finalization ?? null,
          critiqueMatrix: matrix.map((entry) => ({
            role: entry.role,
            name: entry.name,
            targets: entry.critiques.map((critique) => critique.targetRole),
            excerpts: entry.critiques.map((critique) => critique.excerpt.slice(0, 160)),
          })),
          apiSurface: surface.map((entry) => `${entry.method} ${entry.path}`),
          dumpHeadingCounts,
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
