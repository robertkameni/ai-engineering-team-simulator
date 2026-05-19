import type { DeepSeekLanguageModelOptions } from "@ai-sdk/deepseek";

/** Fast chat — no internal reasoning (best for live debate UX). */
export const DEEPSEEK_CHAT_OPTIONS = {
  thinking: { type: "disabled" },
} satisfies DeepSeekLanguageModelOptions;

/** Deep technical reasoning for architecture turns. */
export const DEEPSEEK_REASONING_OPTIONS = {
  thinking: { type: "enabled" },
  reasoningEffort: "high",
} satisfies DeepSeekLanguageModelOptions;
