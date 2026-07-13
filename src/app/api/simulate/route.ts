import { z } from "zod";

import {
  isSimulationAborted,
  runSimulation,
} from "@/ai/orchestration/run-simulation";
import { regenerateRunArtifacts } from "@/ai/artifacts/regenerate-run-artifacts";
import { getRunOwnershipContextWithGuestSession } from "@/lib/auth/run-ownership";
import { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";
import { assertRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { reconcileRunFailure } from "@/lib/db/run-reconcile";
import { setRunUsageTotals, updateRunStatus, updateRunSummary } from "@/lib/db/runs";
import {
  encodeSimulationEvent,
  type SimulationStreamEvent,
} from "@/lib/simulation-stream";

export const runtime = "nodejs";
export const maxDuration = 600;

const SSE_KEEPALIVE_INTERVAL_MS = 25_000;

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

  const stream = new ReadableStream({
    async start(controller) {
      const keepaliveTimer = setInterval(() => {
        if (signal.aborted) {
          return;
        }
        try {
          controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepaliveTimer);
        }
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
        const simulation = await runSimulation(prompt, send, {
          userId,
          guestSessionId,
          usageAccumulator,
          abortSignal: signal,
        });
        runId = simulation.runId;

        if (signal.aborted) {
          await updateRunSummary(
            runId,
            JSON.stringify({ debateOutcome: "aborted", turnCount: null }),
          );
          await reconcileRunFailure(runId, {
            debateComplete: true,
            artifactPhaseStarted: false,
          });
          await setRunUsageTotals(runId, usageAccumulator.getTotals());
          return;
        }

        synthesisStarted = true;
        const synthesis = await regenerateRunArtifacts(runId, {
          scope: { userId, guestSessionId },
          usageAccumulator,
        });

        if (!synthesis.ok) {
          await setRunUsageTotals(runId, usageAccumulator.getTotals());

          if (synthesis.error === "budget_exceeded") {
            console.warn("Artifact synthesis stopped: run cost budget exceeded", {
              runId,
            });
            await reconcileRunFailure(runId, {
              debateComplete: true,
              artifactPhaseStarted: true,
            });
            await updateRunStatus(runId, "failed");
            send({ type: "error", message: "Artifact cost budget exceeded" });
          } else {
            console.error("Artifact synthesis failed:", synthesis);
            await reconcileRunFailure(runId, {
              debateComplete: true,
              artifactPhaseStarted: true,
            });
            await updateRunStatus(runId, "failed");
            send({ type: "error", message: "Artifact synthesis failed" });
          }
          return;
        }

        if (signal.aborted) {
          await updateRunSummary(
            runId,
            JSON.stringify({ debateOutcome: "aborted", turnCount: null }),
          );
          await reconcileRunFailure(runId, {
            debateComplete: true,
            artifactPhaseStarted: synthesisStarted,
          });
          await setRunUsageTotals(runId, usageAccumulator.getTotals());
          return;
        }

        await setRunUsageTotals(runId, usageAccumulator.getTotals());
        await updateRunStatus(runId, "complete");
        send({ type: "done", runId });
      } catch (error) {
        if (runId) {
          await setRunUsageTotals(runId, usageAccumulator.getTotals());
        }

        if (isSimulationAborted(error) || signal.aborted) {
          if (runId && !isSimulationAborted(error)) {
            await updateRunSummary(
              runId,
              JSON.stringify({ debateOutcome: "aborted", turnCount: null }),
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
    },
  });
}
