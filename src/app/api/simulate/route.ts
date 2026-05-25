import { z } from "zod";

import { runSimulation } from "@/ai/orchestration/run-simulation";
import { regenerateRunArtifacts } from "@/ai/artifacts/regenerate-run-artifacts";
import { getSessionUser } from "@/lib/auth/session";
import { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";
import { assertRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { setRunUsageTotals } from "@/lib/db/runs";
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

  const { userId } = await getSessionUser();
  const rateLimit = await assertRateLimit(request, "simulate", userId);
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit);
  }

  const { prompt } = parsed.data;
  const usageAccumulator = new RunUsageAccumulator();
  let runId: string | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SimulationStreamEvent) => {
        controller.enqueue(
          new TextEncoder().encode(encodeSimulationEvent(event)),
        );
      };

      try {
        const simulation = await runSimulation(prompt, send, {
          userId,
          usageAccumulator,
        });
        runId = simulation.runId;

        const synthesis = await regenerateRunArtifacts(runId, {
          usageAccumulator,
        });
        if (!synthesis.ok) {
          console.error("Artifact synthesis failed:", synthesis);
        }

        await setRunUsageTotals(runId, usageAccumulator.getTotals());
        send({ type: "done", runId });
      } catch (error) {
        if (runId) {
          await setRunUsageTotals(runId, usageAccumulator.getTotals());
        }
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
