import type { SimulationAgentRole } from "@/ai/agents/config";
import { reviewerVisibleText } from "@/ai/orchestration/reviewer-decision";

const LEADING_META_COMMENTARY =
  /^(?:(?:Let me(?:\s+\w+){0,6}\s+(?:check|look up|search|verify|find)|Searching for)[^.#\n]{0,240}\.?\s*)+/i;

const INLINE_TOOL_NARRATION = [
  /(?:\*\*)?SvelteKit[^.\n]*(?:non trouvé|not found|meta-framework|create-svelte|scaffold)[^.\n]*\.?\s*/gi,
  /(?:\*\*)?Prisma v[\d.]+(?:\*\*)?\s*OK\.?\s*/gi,
  /(?:\*\*)?(?:SvelteKit v[\d.]+(?:\*\*)?\s*(?:et\s*)?(?:\*\*)?Prisma v[\d.]+(?:\*\*)?\s*confirmés?\.?\s*)/gi,
  /(?:^|\n)[^\n]*(?:non trouvé sur npm|package npm|npm registry)[^\n]*(?:\n|$)/gi,
];

function stripInlineToolNarration(text: string): string {
  let result = text;
  for (const pattern of INLINE_TOOL_NARRATION) {
    result = result.replace(pattern, "");
  }
  return result.replace(/^\s*\.\s*/, "").replace(/\n{3,}/g, "\n\n");
}

function isToolOnlyParagraph(paragraph: string): boolean {
  const trimmed = stripInlineToolNarration(paragraph).trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("##")) return false;
  return /^(?:\*\*)?(?:SvelteKit|Prisma|npm|create-svelte)/i.test(paragraph.trim());
}

function stripToolOnlyOpeningBlock(text: string): string {
  const parts = text.split(/\n\n+/);
  if (parts.length > 1 && isToolOnlyParagraph(parts[0]!)) {
    return parts.slice(1).join("\n\n").trimStart();
  }
  return text;
}

function stripLeadingMetaCommentary(text: string): string {
  return text.replace(LEADING_META_COMMENTARY, "");
}

const TRUNCATION_META_PATTERNS = [
  /\n[^\n]*\btruncation artifact\b[^\n]*/gi,
  /\n[^\n]*The duplicate sentence at the end is a truncation[^\n]*/gi,
];

function stripTruncationMetaCommentary(text: string): string {
  let result = text;
  for (const pattern of TRUNCATION_META_PATTERNS) {
    result = result.replace(pattern, "");
  }
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

export function hasCompletedOpeningBlock(fullText: string): boolean {
  return /\n\n/.test(fullText) || /^##\s/m.test(fullText);
}

function unwrapMarkdownCodeFencesToProse(text: string): string {
  return text.replace(/```[\w-]*\n([\s\S]*?)```/g, (_match, body: string) => {
    const lines = body
      .trim()
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
      .map((line: string) => `- ${line}`);
    return lines.join("\n");
  });
}

function mergeMergedRiskParagraphs(text: string): string {
  return text.replace(
    /(\*\*Risk \d+:[^*]+(?:\*\*)?[^*\n]+)(?=\*\*Risk \d+:|$)/g,
    (segment) => segment.trim(),
  ).replace(/(\.)(\*\*Risk \d+:)/g, "$1\n\n$2");
}

function normalizeMarkdownHeadings(text: string): string {
  return text
    .replace(/([.!?…]["'»]?)\s*(##\s+)/g, "$1\n\n$2")
    .replace(/([a-zà-ÿ0-9])(##\s+)/gi, "$1\n\n$2");
}

/** Final persisted message after an agent turn completes. */
export function normalizeAgentPersistedText(
  role: SimulationAgentRole,
  fullText: string,
): string {
  let text = stripLeadingMetaCommentary(fullText);
  text = stripTruncationMetaCommentary(text);
  text = stripInlineToolNarration(text);
  if (role === "architect") {
    text = stripToolOnlyOpeningBlock(text);
  }
  text = normalizeMarkdownHeadings(text);
  if (role === "architect" || role === "backend" || role === "devops") {
    text = unwrapMarkdownCodeFencesToProse(text);
    text = mergeMergedRiskParagraphs(text);
  }
  return text.trim();
}

/** Text safe to stream to the client (may buffer architect preambles). */
export function getAgentStreamDisplayText(
  role: SimulationAgentRole,
  fullText: string,
): string {
  if (role === "architect" && !hasCompletedOpeningBlock(fullText)) {
    if (!/^##\s/m.test(fullText)) {
      return "";
    }
  }

  let text = normalizeAgentPersistedText(role, fullText);
  if (role === "reviewer") {
    text = reviewerVisibleText(text);
  }
  return text;
}

/** Incremental normalization for streaming — only processes the suffix delta, not the full accumulated text. */
export function normalizeAgentSuffix(
  role: SimulationAgentRole,
  suffix: string,
  isFirstChunk: boolean,
): string {
  let text = suffix;
  if (isFirstChunk) {
    text = stripLeadingMetaCommentary(text);
  }
  text = stripInlineToolNarration(text);
  if (role === "architect" && isFirstChunk) {
    text = stripToolOnlyOpeningBlock(text);
  }
  text = normalizeMarkdownHeadings(text);
  return isFirstChunk ? text.trimStart() : text;
}
