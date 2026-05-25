import type { DeepSeekModelId } from "@/ai/providers";

/** Normalized token totals for a run or a single LLM call. */
export interface RunUsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

/** Increment applied to a run's usage counters. */
export interface UsageDelta {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  modelId?: DeepSeekModelId;
}

export interface RunUsageSnapshot extends RunUsageTotals {
  userId: string | null;
}
