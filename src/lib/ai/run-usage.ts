import type { DeepSeekModelId } from "@/ai/providers";

/** Normalized token totals for a run or a single LLM call. */
export interface RunUsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  /** True when the model omitted usage and totals were synthesized. */
  usageMissing?: boolean;
  /** Peak single-call prompt tokens observed during the run. */
  peakPromptTokens?: number;
}

/** Increment applied to a run's usage counters. */
export interface UsageDelta {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  modelId?: DeepSeekModelId;
  usageMissing?: boolean;
}

export interface RunUsageSnapshot extends RunUsageTotals {
  userId: string | null;
}

/**
 * Usage is always present on exports when the field exists.
 * Zero totals with usageMissing still count as recorded.
 */
export function hasRecordedRunUsage(
  usage: RunUsageTotals | undefined,
): usage is RunUsageTotals {
  return usage != null && (usage.totalTokens > 0 || usage.usageMissing === true);
}
