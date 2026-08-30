import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TeamTemplateId } from "@/ai/agents/team-templates";

import {
  hasCompleteSentenceEnding,
  isIncompleteSpecLine,
  isShortWordFragment,
  lastNonEmptyLine,
} from "@/ai/orchestration/agent-output-completion";
import {
  isFullRepost,
  mergeRepostSections,
} from "@/ai/orchestration/continuation-repost";

const DECISION_TAG_AT_END =
  /\[(?:APPROVE|REJECT:\s*(?:pm|architect|backend|frontend|devops))\]\s*$/i;

const OPEN_INLINE_CODE_AT_END = /`[^`\n]+$/;

const BARE_HTTP_STATUS_AT_END = /\b(?:50[0-4]|40[0-4])\s*$/i;

const INCOMPLETE_LIST_BULLET =
  /^-\s+(?:Internal|Props|State|Renders|Uses|Handles|Accepts|Returns|Emits)\.?$/i;

const INCOMPLETE_COMPONENT_HEADING = /\*\*Component \d+:/i;

const CONTINUED_HEADING =
  /^##\s+.*\((?:continued|suite)\)\s*$/im;

const TRUNCATION_META_COMMENTARY =
  /\btruncation artifact\b|The duplicate sentence at the end is a truncation/i;

const FRONTEND_RISKS_HEADING =
  /^##\s+.*(?:Frontend Risks|Frontend Readiness|Risques frontend|Risques FE|Client Risks|FE Risks)\b/im;

const GLUED_MARKDOWN_HEADING = /[^\n#](#{2,3}\s+\S)/;

const DUPLICATE_TAIL_MIN_CHARS = 80;

export type TruncationCheckOptions = {
  readonly templateId?: TeamTemplateId;
};

export function hasFrontendRisksSection(text: string): boolean {
  return FRONTEND_RISKS_HEADING.test(text);
}

export function hasGluedMarkdownHeading(text: string): boolean {
  return GLUED_MARKDOWN_HEADING.test(text);
}

export function hasDuplicatedTrailingContent(text: string): boolean {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length >= DUPLICATE_TAIL_MIN_CHARS);

  if (paragraphs.length < 2) {
    return false;
  }

  const lastParagraph = paragraphs[paragraphs.length - 1]!;
  return paragraphs.slice(0, -1).some((paragraph) => paragraph === lastParagraph);
}

function lastMarkdownHeading(text: string): string | null {
  const matches = text.match(/^##\s+.+$/gm);
  if (!matches || matches.length === 0) {
    return null;
  }
  return matches[matches.length - 1] ?? null;
}

function contentAfterLastHeading(text: string): string {
  const matches = [...text.matchAll(/^##\s+.+$/gm)];
  const lastMatch = matches[matches.length - 1];
  if (!lastMatch || lastMatch.index === undefined) {
    return text;
  }
  return text.slice(lastMatch.index + lastMatch[0].length).trim();
}

function isIncompleteContinuedSection(text: string): boolean {
  const lastHeading = lastMarkdownHeading(text);
  if (!lastHeading || !CONTINUED_HEADING.test(lastHeading)) {
    return false;
  }

  const afterHeading = contentAfterLastHeading(text);
  if (afterHeading.length < 40) {
    return true;
  }

  return !hasCompleteSentenceEnding(afterHeading);
}

function requiresSoftwareFrontendRisks(
  role: SimulationAgentRole,
  options?: TruncationCheckOptions,
): boolean {
  return role === "frontend" && options?.templateId !== "physical";
}

function hasIncompleteLastLineStructureSignals(
  text: string,
  lastLine: string,
): boolean {
  if (INCOMPLETE_LIST_BULLET.test(lastLine)) {
    return true;
  }
  if (lastLine.startsWith("- Props:") && lastLine.length < 40) {
    return true;
  }
  if (INCOMPLETE_COMPONENT_HEADING.test(lastLine)) {
    return true;
  }
  if (isIncompleteContinuedSection(text)) {
    return true;
  }
  return false;
}

function hasIncompleteFrontendStructureSignals(
  text: string,
  lastLine: string,
): boolean {
  if (hasIncompleteLastLineStructureSignals(text, lastLine)) {
    return true;
  }
  if (isIncompleteSpecLine(lastLine)) {
    return true;
  }
  if (isShortWordFragment(lastLine)) {
    return true;
  }
  if (!hasCompleteSentenceEnding(text)) {
    return true;
  }
  return false;
}

/** Heuristic: model hit maxOutputTokens or stopped mid-thought. */
export function looksLikeTruncatedAgentOutput(
  text: string,
  role: SimulationAgentRole,
  options?: TruncationCheckOptions,
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

  if (hasGluedMarkdownHeading(trimmed)) {
    return true;
  }

  if (hasDuplicatedTrailingContent(trimmed)) {
    return true;
  }

  const lastLine = lastNonEmptyLine(trimmed);

  if (hasIncompleteLastLineStructureSignals(trimmed, lastLine)) {
    return true;
  }

  if (TRUNCATION_META_COMMENTARY.test(trimmed)) {
    return true;
  }

  if (isIncompleteSpecLine(lastLine)) {
    return true;
  }

  if (lastLine.length >= 8 && /\([^)\n]*$/.test(lastLine) && lastLine.includes("(")) {
    return true;
  }

  // Missing Frontend Risks alone is a deliverable-quality gap, not truncation,
  // unless the turn also shows incomplete structure (cut mid-bullet/component).
  if (
    requiresSoftwareFrontendRisks(role, options) &&
    trimmed.length >= 120 &&
    !hasFrontendRisksSection(trimmed) &&
    hasIncompleteFrontendStructureSignals(trimmed, lastLine)
  ) {
    return true;
  }

  if (isShortWordFragment(lastLine)) {
    return true;
  }

  if (trimmed.length < 80) {
    return false;
  }

  if (role === "reviewer" && DECISION_TAG_AT_END.test(trimmed)) {
    return false;
  }

  if (hasCompleteSentenceEnding(trimmed)) {
    return false;
  }

  if (lastLine.length < 12) {
    if (/^-\s+\S+$/u.test(lastLine)) {
      return true;
    }
    return false;
  }

  if (/[\p{L}\p{N}_/-]$/u.test(lastLine)) {
    return true;
  }

  return false;
}

function stripOverlappingContinuationPrefix(
  prior: string,
  continuation: string,
): string {
  const priorTrimmed = prior.trimEnd();
  const next = continuation.trimStart();
  if (!priorTrimmed || !next) {
    return next;
  }

  const maxOverlap = Math.min(400, priorTrimmed.length, next.length);
  for (let size = maxOverlap; size >= 24; size -= 1) {
    const priorSuffix = priorTrimmed.slice(-size);
    if (next.startsWith(priorSuffix)) {
      return next.slice(size).trimStart();
    }
  }

  return next;
}

export function mergeContinuationText(
  prior: string,
  continuation: string,
): string {
  const base = prior.trimEnd();
  if (isFullRepost(base, continuation)) {
    return sanitizeMergedContinuation(
      mergeRepostSections(base, continuation.trimStart()),
    );
  }
  const next = stripOverlappingContinuationPrefix(base, continuation);
  if (!next) {
    return sanitizeMergedContinuation(base);
  }
  if (!base) {
    return sanitizeMergedContinuation(next);
  }
  return sanitizeMergedContinuation(`${base}\n\n${next}`);
}

function finalSectionGuidance(role: SimulationAgentRole): string {
  if (role === "frontend") {
    return "Finish any incomplete component entry, then complete ## Frontend Risks with at least three concrete domain-specific risks and mitigations, then end with ## Frontend Readiness confirming the UI plan is implementable. End on a complete sentence.";
  }
  if (role === "backend") {
    return "Complete ## Backend Risks with named bottlenecks and mitigations. End on a complete sentence.";
  }
  if (role === "devops") {
    return "Complete ## Monitoring & Rollback and ## Risks. End on a complete sentence.";
  }
  if (role === "architect") {
    return "Complete ## Decisions & Risks. End on a complete sentence.";
  }
  if (role === "reviewer") {
    return "If the prior message already ends with [APPROVE] or [REJECT: role], output exactly NO_CONTINUATION_NEEDED and nothing else. Otherwise finish recommendations briefly, then end with [APPROVE] or [REJECT: role] alone on the absolute last line — never emit a second decision tag.";
  }
  return "Complete your role's final mandatory section and end on a complete sentence.";
}

const CONTINUATION_META_LINE =
  /^(?:no(?:\s+further)?\s+continuation\s+needed|already\s+complete|nothing\s+to\s+(?:add|continue)|done\.?|no_continuation_needed)$/i;

/** Live models emit prose like "I have no continuation needed". */
const CONTINUATION_META_INLINE =
  /\b(?:i\s+have\s+)?no(?:\s+further)?\s+continuation\s+needed\b|\bnothing\s+(?:further\s+)?to\s+(?:add|continue)\b|\bno_continuation_needed\b/i;

const DECISION_TAG_GLOBAL =
  /\[(?:APPROVE|REJECT:\s*(?:pm|architect|backend|frontend|devops))\]/gi;

/**
 * True when a continuation adds no substantive content (meta-only or
 * duplicate decision tags). Used to stop continuation loops that append
 * "no continuation needed" + another [APPROVE].
 */
export function isWorthlessContinuation(continuation: string): boolean {
  const trimmed = continuation.trim();
  if (!trimmed) {
    return true;
  }

  const withoutTags = trimmed.replace(DECISION_TAG_GLOBAL, "").trim();
  if (!withoutTags) {
    return true;
  }

  const substantiveLines = withoutTags
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => {
      if (line.length === 0) {
        return false;
      }
      if (CONTINUATION_META_LINE.test(line)) {
        return false;
      }
      if (CONTINUATION_META_INLINE.test(line) && line.length < 280) {
        return false;
      }
      return true;
    });

  if (substantiveLines.length === 0) {
    return true;
  }

  // Entire body is meta prose even if multi-sentence.
  if (CONTINUATION_META_INLINE.test(withoutTags) && withoutTags.length < 400) {
    return true;
  }

  return false;
}

/**
 * Strip continuation meta-commentary and collapse duplicate trailing
 * decision tags so merged reviewer turns do not accumulate [APPROVE] spam.
 */
export function sanitizeMergedContinuation(text: string): string {
  const withoutMeta = text
    .split(/\n+/)
    .filter((line) => {
      const trimmed = line.trim();
      if (CONTINUATION_META_LINE.test(trimmed)) {
        return false;
      }
      if (CONTINUATION_META_INLINE.test(trimmed) && trimmed.length < 280) {
        return false;
      }
      return true;
    })
    .join("\n")
    .trim();

  const tags = [...withoutMeta.matchAll(DECISION_TAG_GLOBAL)];
  if (tags.length <= 1) {
    return withoutMeta;
  }

  const lastTag = tags[tags.length - 1]![0];
  const withoutTags = withoutMeta.replace(DECISION_TAG_GLOBAL, "").trimEnd();
  return `${withoutTags}\n\n${lastTag}`;
}

export function buildTruncationContinuationPrompt(
  tail: string,
  role: SimulationAgentRole = "frontend",
): string {
  const excerpt = tail.trim().slice(-600);
  const priorTokensEstimate = Math.max(40, Math.ceil(tail.trim().length / 4));
  const targetTokens = Math.max(120, Math.min(900, Math.floor(priorTokensEstimate * 0.55)));
  return `BREVITY RETRY — Your previous team message truncated (~${priorTokensEstimate} tokens of content). Produce the SAME substance more concisely under ~${targetTokens} tokens. Continue from the exact next token — do not repeat sentences or headings already written, do not re-paste prior paragraphs, do not add meta-commentary about limits. Close any open backticks, parentheses, or JSON. ${finalSectionGuidance(role)} Last characters of your prior message:

"""${excerpt}"""`;
}
