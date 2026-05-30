import type { SimulationAgentRole } from "@/ai/agents/config";

const DECISION_TAG_AT_END =
  /\[(?:APPROVE|REJECT:\s*(?:pm|architect|backend|frontend|devops))\]\s*$/i;

const CLEAN_TERMINATORS = /[.!?…:;»")\]]\s*$/u;

const OPEN_INLINE_CODE_AT_END = /`[^`\n]+$/;

const BARE_HTTP_STATUS_AT_END = /\b(?:50[0-4]|40[0-4])\s*$/i;

/** Heuristic: model hit maxOutputTokens or stopped mid-thought. */
export function looksLikeTruncatedAgentOutput(
  text: string,
  role: SimulationAgentRole,
): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return false;
  }

  const fenceCount = (trimmed.match(/```/g) ?? []).length;
  if (fenceCount % 2 !== 0) {
    return true;
  }

  if (OPEN_INLINE_CODE_AT_END.test(trimmed)) {
    return true;
  }

  if (BARE_HTTP_STATUS_AT_END.test(trimmed)) {
    return true;
  }

  const lastLine = trimmed.split("\n").pop()?.trim() ?? "";
  if (lastLine.length >= 8 && /\([^)\n]*$/.test(lastLine) && lastLine.includes("(")) {
    return true;
  }

  if (trimmed.length < 80) {
    return false;
  }

  if (role === "reviewer" && DECISION_TAG_AT_END.test(trimmed)) {
    return false;
  }

  if (CLEAN_TERMINATORS.test(trimmed)) {
    return false;
  }

  if (lastLine.length < 12) {
    return false;
  }

  if (/[\p{L}\p{N}_/-]$/u.test(lastLine)) {
    return true;
  }

  return false;
}

export function buildTruncationContinuationPrompt(tail: string): string {
  const excerpt = tail.trim().slice(-600);
  return `Your previous team message was cut off by the output limit. Continue from the exact next token — do not repeat sentences or headings already written, do not add meta-commentary about limits. Close any open backticks, parentheses, or JSON. Last characters of your prior message:

"""${excerpt}"""`;
}
