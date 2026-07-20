import type { LanguageModelUsage } from "ai";

import { usageDeltaFromLanguageModelUsage } from "@/ai/pricing";
import type { DeepSeekModelId } from "@/ai/providers";
import type { RunUsageTotals, UsageDelta } from "@/lib/ai/run-usage";

/** streamText result: prefer totalUsage (all steps) over usage (last step only). */
export type StreamTextUsageSource = {
  usage: PromiseLike<LanguageModelUsage>;
  totalUsage?: PromiseLike<LanguageModelUsage>;
};

const SYNTHETIC_MISSING_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
} as LanguageModelUsage;

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
      usageMissing: existing.usageMissing,
    });
    if (existing.peakPromptTokens != null) {
      accumulator.notePromptTokens(existing.peakPromptTokens);
    }
  }
  return accumulator;
}

export class RunUsageAccumulator {
  private promptTokens = 0;
  private completionTokens = 0;
  private totalTokens = 0;
  private estimatedCostUsd = 0;
  private usageMissing = false;
  private peakPromptTokens = 0;

  addDelta(delta: UsageDelta): void {
    this.promptTokens += delta.promptTokens;
    this.completionTokens += delta.completionTokens;
    this.totalTokens += delta.totalTokens;
    this.estimatedCostUsd += delta.estimatedCostUsd;
    if (delta.usageMissing) {
      this.usageMissing = true;
    }
    this.notePromptTokens(delta.promptTokens);
  }

  notePromptTokens(promptTokens: number): void {
    if (promptTokens > this.peakPromptTokens) {
      this.peakPromptTokens = promptTokens;
    }
  }

  addFromUsage(
    usage: LanguageModelUsage | undefined,
    modelId: DeepSeekModelId,
  ): void {
    if (!usage || isEmptyUsage(usage)) {
      console.warn("USAGE FAIL-SAFE: model returned no usage — synthesizing zero totals", {
        modelId,
      });
      this.addDelta({
        ...usageDeltaFromLanguageModelUsage(SYNTHETIC_MISSING_USAGE, modelId),
        usageMissing: true,
      });
      return;
    }

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
      console.warn("Failed to read stream usage — synthesizing missing usage:", error);
      this.addFromUsage(undefined, modelId);
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
      console.warn(
        "Failed to read generateText usage — synthesizing missing usage:",
        error,
      );
      this.addFromUsage(undefined, modelId);
    }
  }

  getTotals(): RunUsageTotals {
    return {
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens: this.totalTokens,
      estimatedCostUsd: this.estimatedCostUsd,
      usageMissing: this.usageMissing || undefined,
      peakPromptTokens:
        this.peakPromptTokens > 0 ? this.peakPromptTokens : undefined,
    };
  }
}

function isEmptyUsage(usage: LanguageModelUsage): boolean {
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const total = usage.totalTokens ?? 0;
  return input === 0 && output === 0 && total === 0;
}
