import "server-only";

import { regenerateRunArtifacts } from "@/ai/artifacts/regenerate-run-artifacts";
import type { RegenerateRunArtifactsResult } from "@/ai/artifacts/regenerate-run-artifacts";
import {
  createRunUsageAccumulator,
} from "@/lib/ai/run-usage-accumulator";
import { getRunUsageTotalsById, setRunUsageTotals } from "@/lib/db/runs";

export async function regenerateRunArtifactsWithUsage(
  runId: string,
): Promise<RegenerateRunArtifactsResult> {
  const existing = await getRunUsageTotalsById(runId);
  const usageAccumulator = createRunUsageAccumulator(existing);
  const result = await regenerateRunArtifacts(runId, { usageAccumulator });

  await setRunUsageTotals(runId, usageAccumulator.getTotals());

  return result;
}
