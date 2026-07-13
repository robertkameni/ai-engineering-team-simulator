import { generateBlueprintArtifact } from "@/ai/artifacts/generate-blueprint-artifact";
import { getRunOwnershipContext } from "@/lib/auth/run-ownership";
import { createRunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";
import { getRunUsageTotalsById, setRunUsageTotals } from "@/lib/db/runs";
import { assertRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

interface RouteParams {
  params: Promise<{ id: string; }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const scope = await getRunOwnershipContext();
  const rateLimit = await assertRateLimit(request, "regenerate", scope.userId);
  if (!rateLimit.ok) {
    return rateLimitResponse(rateLimit);
  }

  const existingUsage = await getRunUsageTotalsById(id);
  const usageAccumulator = createRunUsageAccumulator(existingUsage);
  const result = await generateBlueprintArtifact(id, {
    scope,
    usageAccumulator,
  });

  await setRunUsageTotals(id, usageAccumulator.getTotals());

  if (!result.ok) {
    const statusByError: Record<
      typeof result.error,
      number
    > = {
      not_found: 404,
      forbidden: 404,
      no_messages: 400,
      run_in_progress: 409,
      already_ready: 409,
      generation_failed: 500,
      budget_exceeded: 402,
    };

    return Response.json(
      { error: result.error, message: result.message },
      { status: statusByError[result.error] },
    );
  }

  return Response.json({
    artifacts: result.artifacts,
    status: "ready",
  });
}
