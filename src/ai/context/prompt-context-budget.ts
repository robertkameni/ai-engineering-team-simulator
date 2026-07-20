/** Soft character budget for assembled debate prompts (~50k tokens ≈ 200k chars). */
export const PROMPT_CONTEXT_BUDGET_CHARS = 80_000;

/** Peak prompt token soft ceiling for run telemetry / guards. */
export const PROMPT_CONTEXT_BUDGET_TOKENS = 50_000;

const CHARS_PER_TOKEN_ESTIMATE = 4;

export function estimatePromptTokensFromChars(charCount: number): number {
  return Math.ceil(charCount / CHARS_PER_TOKEN_ESTIMATE);
}

export function isPromptContextOverBudget(params: {
  readonly charCount?: number;
  readonly promptTokens?: number;
}): boolean {
  if (params.promptTokens != null) {
    return params.promptTokens > PROMPT_CONTEXT_BUDGET_TOKENS;
  }
  if (params.charCount != null) {
    return params.charCount > PROMPT_CONTEXT_BUDGET_CHARS;
  }
  return false;
}

/**
 * Truncate assembled user-message content to the prompt budget, keeping the
 * tail (most recent / turn prompt) intact when possible.
 */
export function truncatePromptContentToBudget(
  content: string,
  maxChars = PROMPT_CONTEXT_BUDGET_CHARS,
): { readonly content: string; readonly wasTruncated: boolean } {
  if (content.length <= maxChars) {
    return { content, wasTruncated: false };
  }
  const head = Math.floor(maxChars * 0.15);
  const tail = maxChars - head - 80;
  return {
    content: `${content.slice(0, head).trimEnd()}\n\n…[contextBudgetExceeded: prior context truncated]…\n\n${content.slice(-tail).trimStart()}`,
    wasTruncated: true,
  };
}
