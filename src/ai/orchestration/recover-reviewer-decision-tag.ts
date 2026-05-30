import { generateText } from "ai";

import { DEEPSEEK_CHAT_OPTIONS } from "@/ai/deepseek-options";
import {
  extractReviewerDecisionTag,
  parseReviewerDecision,
} from "@/ai/orchestration/reviewer-decision";
import { getDeepSeekModel } from "@/ai/providers";
import type { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";

const REVIEW_EXCERPT_CHARS = 2400;

function formatRecoveredTag(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const tag = extractReviewerDecisionTag(trimmed);
  if (tag?.kind === "approve") {
    return "[APPROVE]";
  }
  if (tag?.kind === "reject") {
    const parsed = parseReviewerDecision(trimmed);
    if (parsed.decision === "reject" && parsed.rejectRole) {
      return `[REJECT: ${parsed.rejectRole}]`;
    }
  }

  const parsed = parseReviewerDecision(trimmed);
  if (parsed.decision === "approve") {
    return "[APPROVE]";
  }
  if (parsed.decision === "reject" && parsed.rejectRole) {
    return `[REJECT: ${parsed.rejectRole}]`;
  }

  return null;
}

/** Flash fallback when the reviewer stream omits or truncates the mandatory tag. */
export async function recoverReviewerDecisionTag(
  reviewText: string,
  options: {
    usageAccumulator?: RunUsageAccumulator;
    abortSignal?: AbortSignal;
  } = {},
): Promise<string | null> {
  const excerpt = reviewText.trimEnd().slice(-REVIEW_EXCERPT_CHARS);
  if (!excerpt) {
    return null;
  }

  try {
    const result = await generateText({
      model: getDeepSeekModel("deepseek-v4-flash"),
      system:
        "You output exactly one decision tag on a single line. No other text.",
      prompt: `A technical review ended without a valid decision tag. From the excerpt, output ONLY one line:
- [APPROVE] if no blocking flaws need another team pass
- [REJECT: role] if a blocking flaw needs correction (role = pm, architect, backend, frontend, or devops)

Review excerpt:
${excerpt}`,
      maxOutputTokens: 48,
      temperature: 0,
      abortSignal: options.abortSignal,
      providerOptions: { deepseek: DEEPSEEK_CHAT_OPTIONS },
    });

    await options.usageAccumulator?.addFromGenerateTextResult(
      result,
      "deepseek-v4-flash",
    );

    return formatRecoveredTag(result.text);
  } catch (error) {
    console.warn("Reviewer decision tag recovery failed:", error);
    return null;
  }
}
