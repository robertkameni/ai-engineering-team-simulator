import { generateText } from "ai";

import { DEEPSEEK_CHAT_OPTIONS } from "@/ai/deepseek-options";
import {
  extractReviewerDecisionTag,
  parseReviewerDecision,
} from "@/ai/orchestration/reviewer-decision";
import { getDeepSeekModel } from "@/ai/providers";
import type { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";

const REVIEW_EXCERPT_CHARS = 2400;
const UNRESOLVED_STATUS_MARKER =
  /\((?:UNRESOLVED)\)|\b(?:is|remains?|still|marked)\s+UNRESOLVED\b/i;
const OPEN_GAP_MARKER =
  /\b(?:still missing|not yet (?:implemented|addressed)|remains? open|open gap)\b/i;
const CLEAR_CLOSURE_MARKER =
  /\b(?:no unresolved|all (?:critical )?risks (?:have|are)|objections? (?:are |were )?addressed|ready for implementation|fully specified)\b/i;

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

/** Guardrail for approve recovery — refuse when open-gap language remains. */
export function shouldRecoverApproveFromExcerpt(excerpt: string): boolean {
  const trimmed = excerpt.trim();
  if (!trimmed) {
    return false;
  }
  if (UNRESOLVED_STATUS_MARKER.test(trimmed) || OPEN_GAP_MARKER.test(trimmed)) {
    return false;
  }
  return CLEAR_CLOSURE_MARKER.test(trimmed);
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
- [APPROVE] only if the excerpt clearly states all blocking gaps are addressed AND does not mark anything UNRESOLVED
- [REJECT: role] if a blocking flaw still needs correction (role = pm, architect, backend, frontend, or devops)

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

    const recovered = formatRecoveredTag(result.text);
    if (recovered === "[APPROVE]" && !shouldRecoverApproveFromExcerpt(excerpt)) {
      return null;
    }
    return recovered;
  } catch (error) {
    console.warn("Reviewer decision tag recovery failed:", error);
    return null;
  }
}
