/**
 * Full re-post detection for truncation continuations. When a model, told its
 * turn was truncated, re-emits the whole plan (usually compressed) instead of
 * continuing from the truncation point, the merged message duplicates every
 * section. Re-posts are detected by heading overlap and merged at section
 * granularity so the longer/complete version of each section survives.
 */

import { hasCompleteSentenceEnding } from "@/ai/orchestration/agent-output-completion";

const H2_SPLIT = /(?=^##\s.+$)/gm;

function splitSections(text: string): string[] {
  return text
    .split(H2_SPLIT)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function isH2Section(part: string): boolean {
  return /^##\s+/.test(part);
}

function sectionHeading(part: string): string {
  const heading = part.split("\n")[0] ?? "";
  return heading.replace(/\s+/g, " ").trim().toLowerCase();
}

function headingParts(text: string): string[] {
  return splitSections(text).filter(isH2Section);
}

function headingSet(text: string): Set<string> {
  return new Set(headingParts(text).map(sectionHeading));
}

/**
 * True when the continuation restarts the document from a section the prior
 * already contains and duplicates at least two headings (or half of them).
 * A genuine "continue from the next token" continuation does not repeat
 * headings, so this only matches re-emissions.
 */
export function isFullRepost(prior: string, continuation: string): boolean {
  const priorHeadingSet = headingSet(prior);
  const continuationHeadings = headingParts(continuation);

  if (continuationHeadings.length < 2) {
    return false;
  }

  const duplicated = continuationHeadings.filter((part) =>
    priorHeadingSet.has(sectionHeading(part)),
  ).length;

  if (duplicated < 2) {
    return false;
  }
  if (duplicated / continuationHeadings.length < 0.5) {
    return false;
  }

  return priorHeadingSet.has(sectionHeading(continuationHeadings[0]!));
}

/**
 * Section-granular merge for a re-post: keep the prior's sections, replace a
 * section with the continuation's version only when the prior's copy was cut
 * off mid-section (truncation), and append sections the prior never reached
 * (the tail beyond the truncation point). A complete prior section is the
 * primary deliverable; the continuation's compressed re-emission of it is
 * discarded rather than swapping in less informative wording.
 */
export function mergeRepostSections(
  prior: string,
  continuation: string,
): string {
  const kept = [...splitSections(prior)];

  for (const part of splitSections(continuation)) {
    if (!isH2Section(part)) {
      continue;
    }

    const heading = sectionHeading(part);
    const existingIndex = kept.findIndex(
      (keptPart) => isH2Section(keptPart) && sectionHeading(keptPart) === heading,
    );

    if (existingIndex === -1) {
      kept.push(part);
      continue;
    }

    const priorPart = kept[existingIndex]!;
    if (!hasCompleteSentenceEnding(priorPart)) {
      if (hasCompleteSentenceEnding(part) || part.length > priorPart.length) {
        kept[existingIndex] = part;
      }
    }
  }

  return kept.join("\n\n");
}
