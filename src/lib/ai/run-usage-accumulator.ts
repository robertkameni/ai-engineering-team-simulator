import type { LanguageModelUsage } from "ai";

import { usageDeltaFromLanguageModelUsage } from "@/ai/pricing";
import type { DeepSeekModelId } from "@/ai/providers";
import type { RunUsageTotals, UsageDelta } from "@/lib/ai/run-usage";

/** streamText result: prefer totalUsage (all steps) over usage (last step only). */
export type StreamTextUsageSource = {
  usage: PromiseLike<LanguageModelUsage>;
  totalUsage?: PromiseLike<LanguageModelUsage>;
};

export function createRunUsageAccumulator(
  existing?: RunUsageTotals | null,
): RunUsageAccumulator {
  const accumulator = new RunUsageAccumulator();
  if (existing) {
    accumulator.addDelta({
      promptTokens: existing.promptTokens,
      completionTokens: existing.completionTokens,
      totalTokens: existing.totalTokens,
      estimatedCostUsd: existing.estimatedCostUsd,
    });
  }
  return accumulator;
}

export class RunUsageAccumulator {
  private promptTokens = 0;
  private completionTokens = 0;
  private totalTokens = 0;
  private estimatedCostUsd = 0;

  addDelta(delta: UsageDelta): void {
    this.promptTokens += delta.promptTokens;
    this.completionTokens += delta.completionTokens;
    this.totalTokens += delta.totalTokens;
    this.estimatedCostUsd += delta.estimatedCostUsd;
  }

  addFromUsage(
    usage: LanguageModelUsage | undefined,
    modelId: DeepSeekModelId,
  ): void {
    this.addDelta(usageDeltaFromLanguageModelUsage(usage, modelId));
  }

  async addFromStreamResult(
    result: StreamTextUsageSource,
    modelId: DeepSeekModelId,
  ): Promise<void> {
    try {
      const usage = await (result.totalUsage ?? result.usage);
      this.addFromUsage(usage, modelId);
    } catch (error) {
      console.warn("Failed to read stream usage:", error);
    }
  }

  async addFromGenerateTextResult(
    result: { usage: LanguageModelUsage | PromiseLike<LanguageModelUsage> },
    modelId: DeepSeekModelId,
  ): Promise<void> {
    try {
      const usage = await Promise.resolve(result.usage);
      this.addFromUsage(usage, modelId);
    } catch (error) {
      console.warn("Failed to read generateText usage:", error);
    }
  }

  getTotals(): RunUsageTotals {
    return {
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens: this.totalTokens,
      estimatedCostUsd: this.estimatedCostUsd,
    };
  }
}
