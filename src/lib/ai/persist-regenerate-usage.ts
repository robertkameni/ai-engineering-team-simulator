import "server-only";

import { regenerateRunArtifacts } from "@/ai/artifacts/regenerate-run-artifacts";
import type { RegenerateRunArtifactsResult } from "@/ai/artifacts/regenerate-run-artifacts";
import type { RunOwnershipScope } from "@/lib/auth/run-ownership";
import {
  createRunUsageAccumulator,
} from "@/lib/ai/run-usage-accumulator";
import { getRunUsageTotalsById, setRunUsageTotals } from "@/lib/db/runs";

export async function regenerateRunArtifactsWithUsage(
  runId: string,
  scope: RunOwnershipScope,
): Promise<RegenerateRunArtifactsResult> {
  const existing = await getRunUsageTotalsById(runId);
  const usageAccumulator = createRunUsageAccumulator(existing);
  const result = await regenerateRunArtifacts(runId, {
    scope,
    usageAccumulator,
  });

  await setRunUsageTotals(runId, usageAccumulator.getTotals());

  return result;
}
