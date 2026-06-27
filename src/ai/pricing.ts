import type { LanguageModelUsage } from "ai";

import type { DeepSeekModelId } from "@/ai/providers";
import type { UsageDelta } from "@/lib/ai/run-usage";

/**
 * USD per 1M tokens — defaults from DeepSeek v4 pricing.
 * @see https://api-docs.deepseek.com/quick_start/pricing
 */
interface ModelPricing {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  /** Cache-hit input rate (typically ~1/50 of cache-miss). */
  cachedInputUsdPerMillion: number;
}

const DEFAULT_PRICING: Record<DeepSeekModelId, ModelPricing> = {
  "deepseek-v4-flash": {
    inputUsdPerMillion: 0.14,
    outputUsdPerMillion: 0.28,
    cachedInputUsdPerMillion: 0.0028,
  },
  /**
   * Pro defaults use the 75% promotional rates (valid until 2026-05-31 15:59 UTC).
   * Post-promo: input $1.74, cache hit $0.0145, output $3.48 per 1M.
   */
  "deepseek-v4-pro": {
    inputUsdPerMillion: 0.435,
    outputUsdPerMillion: 0.87,
    cachedInputUsdPerMillion: 0.003625,
  },
};

function parseEnvRate(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function pricingForModel(modelId: DeepSeekModelId): ModelPricing {
  const defaults = DEFAULT_PRICING[modelId];
  const prefix =
    modelId === "deepseek-v4-pro" ? "DEEPSEEK_PRO" : "DEEPSEEK_FLASH";
  return {
    inputUsdPerMillion: parseEnvRate(
      `${prefix}_INPUT_USD_PER_M`,
      defaults.inputUsdPerMillion,
    ),
    outputUsdPerMillion: parseEnvRate(
      `${prefix}_OUTPUT_USD_PER_M`,
      defaults.outputUsdPerMillion,
    ),
    cachedInputUsdPerMillion: parseEnvRate(
      `${prefix}_CACHED_INPUT_USD_PER_M`,
      defaults.cachedInputUsdPerMillion,
    ),
  };
}

export interface NormalizedUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  standardPromptTokens: number;
  cachedPromptTokens: number;
}

/** Maps AI SDK `LanguageModelUsage` to stable prompt/completion totals. */
function normalizeLanguageModelUsage(
  usage: LanguageModelUsage | undefined,
): NormalizedUsage {
  if (!usage) {
    return {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      standardPromptTokens: 0,
      cachedPromptTokens: 0,
    };
  }

  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const cacheReadTokens =
    usage.inputTokenDetails?.cacheReadTokens ??
    usage.cachedInputTokens ??
    0;
  const noCacheTokens =
    usage.inputTokenDetails?.noCacheTokens ??
    Math.max(0, inputTokens - cacheReadTokens);

  const promptTokens = inputTokens || noCacheTokens + cacheReadTokens;
  const completionTokens = outputTokens;
  const totalTokens =
    usage.totalTokens ?? promptTokens + completionTokens;

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    standardPromptTokens: noCacheTokens,
    cachedPromptTokens: cacheReadTokens,
  };
}

function estimateCostUsd(
  usage: LanguageModelUsage | undefined,
  modelId: DeepSeekModelId,
): number {
  const normalized = normalizeLanguageModelUsage(usage);
  if (
    normalized.promptTokens === 0 &&
    normalized.completionTokens === 0
  ) {
    return 0;
  }

  const rates = pricingForModel(modelId);
  const inputCost =
    (normalized.standardPromptTokens / 1_000_000) *
      rates.inputUsdPerMillion +
    (normalized.cachedPromptTokens / 1_000_000) *
      rates.cachedInputUsdPerMillion;
  const outputCost =
    (normalized.completionTokens / 1_000_000) * rates.outputUsdPerMillion;

  return inputCost + outputCost;
}

export function usageDeltaFromLanguageModelUsage(
  usage: LanguageModelUsage | undefined,
  modelId: DeepSeekModelId,
): UsageDelta {
  const normalized = normalizeLanguageModelUsage(usage);
  return {
    promptTokens: normalized.promptTokens,
    completionTokens: normalized.completionTokens,
    totalTokens: normalized.totalTokens,
    estimatedCostUsd: estimateCostUsd(usage, modelId),
    modelId,
  };
}
