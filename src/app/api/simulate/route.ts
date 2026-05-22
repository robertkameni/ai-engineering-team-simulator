import { z } from "zod";
import { after } from "next/server";

import { runSimulation } from "@/ai/orchestration/run-simulation";
import { regenerateRunArtifacts } from "@/ai/artifacts/regenerate-run-artifacts";
import {
  encodeSimulationEvent,
  type SimulationStreamEvent,
} from "@/lib/simulation-stream";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Prompt is required (1–4000 characters)" },
      { status: 400 },
    );
  }

  const { prompt } = parsed.data;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SimulationStreamEvent) => {
        controller.enqueue(
          new TextEncoder().encode(encodeSimulationEvent(event)),
        );
      };

      let successRunId: string | null = null;
      try {
        successRunId = await runSimulation(prompt, send);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Simulation failed";
        send({ type: "error", message });
      } finally {
        if (successRunId) {
          const runIdForSynthesis = successRunId;
          after(() => {
            void regenerateRunArtifacts(runIdForSynthesis).catch((error) => {
              console.error("Deferred artifact synthesis failed:", error);
            });
          });
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
