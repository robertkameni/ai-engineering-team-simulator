import { z } from "zod";

import {
  isSimulationAborted,
  runSimulation,
} from "@/ai/orchestration/run-simulation";
import { getRunOwnershipContextWithGuestSession } from "@/lib/auth/run-ownership";
import { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";
import {
  awaitCoreArtifactSynthesis,
  dispatchCoreArtifactSynthesisWorker,
} from "@/lib/ai/schedule-artifact-synthesis";
import { assertRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { reconcileRunFailure } from "@/lib/db/run-reconcile";
import { buildRunSummaryPayload } from "@/lib/db/run-summary";
import { setRunUsageTotals, updateRunSummary } from "@/lib/db/runs";
import {
  encodeSimulationEvent,
  type SimulationStreamEvent,
} from "@/lib/simulation-stream";

export const runtime = "nodejs";
export const maxDuration = 600;

const SSE_KEEPALIVE_INTERVAL_MS = 15_000;

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

  const { userId, guestSessionId } = await getRunOwnershipContextWithGuestSession();
  const rateLimit = await assertRateLimit(request, "simulate", userId);
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit);
  }

  const { prompt } = parsed.data;
  const usageAccumulator = new RunUsageAccumulator();
  const signal = request.signal;
  let runId: string | undefined;
  let synthesisStarted = false;
  const ownershipScope = { userId, guestSessionId };

  const stream = new ReadableStream({
    async start(controller) {
      const keepaliveTimer = setInterval(() => {
        if (signal.aborted) {
          return;
        }
        send({ type: "heartbeat" });
      }, SSE_KEEPALIVE_INTERVAL_MS);

      const send = (event: SimulationStreamEvent) => {
        if (signal.aborted) {
          return;
        }
        try {
          controller.enqueue(
            new TextEncoder().encode(encodeSimulationEvent(event)),
          );
        } catch (error) {
          console.warn("Simulation stream: failed to enqueue event", {
            eventType: event.type,
            error,
          });
        }
      };

      try {
        const simulation = await runSimulation(
          prompt,
          (event) => {
            if (event.type === "run_started") {
              runId = event.runId;
            }
            send(event);
          },
          {
            userId,
            guestSessionId,
            usageAccumulator,
          },
        );
        runId = simulation.runId;
        synthesisStarted = true;

        await setRunUsageTotals(runId, usageAccumulator.getTotals());

        if (signal.aborted) {
          // Client left after debate — keep synthesis alive via worker.
          dispatchCoreArtifactSynthesisWorker(request, runId, ownershipScope);
          return;
        }

        const synthesis = await awaitCoreArtifactSynthesis({
          runId,
          scope: ownershipScope,
          usageAccumulator,
          onArtifactComplete: (artifactType) => {
            send({ type: "artifact_complete", artifactType });
          },
        });

        if (signal.aborted) {
          return;
        }

        if (synthesis.completed && !synthesis.timedOut) {
          if (synthesis.ok) {
            send({ type: "all_artifacts_complete" });
          }
          send({ type: "done", runId });
          return;
        }

        // Timed out awaiting synthesis — synthesis may still finish in-process;
        // signal the client to fall back to polling.
        send({
          type: "done",
          runId,
          artifactTimeout: true,
        });
      } catch (error) {
        if (runId) {
          await setRunUsageTotals(runId, usageAccumulator.getTotals());
        }

        if (isSimulationAborted(error)) {
          if (runId) {
            await updateRunSummary(
              runId,
              buildRunSummaryPayload({
                debateOutcome: "aborted",
                turnCount: null,
              }),
            );
            await reconcileRunFailure(runId, {
              debateComplete: true,
              artifactPhaseStarted: synthesisStarted,
            });
          }
          if (!signal.aborted) {
            send({ type: "error", message: "Simulation cancelled" });
          }
          return;
        }

        console.error("Simulation failed:", { runId, error });
        if (runId) {
          await reconcileRunFailure(runId, {
            debateComplete: false,
            artifactPhaseStarted: synthesisStarted,
          });
        }
        send({ type: "error", message: "Simulation failed" });
      } finally {
        clearInterval(keepaliveTimer);
        controller.close();
      }
    },
    cancel() {
      console.log("Client disconnected from simulation stream", { runId });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
