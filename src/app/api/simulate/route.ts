import { z } from "zod";

import { runSimulation } from "@/ai/orchestration/run-simulation";
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

      try {
        await runSimulation(prompt, send);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Simulation failed";
        send({ type: "error", message });
      } finally {
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
