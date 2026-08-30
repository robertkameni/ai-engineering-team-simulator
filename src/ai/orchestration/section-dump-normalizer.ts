/**
 * Caps pathological repeated Bottleneck / Risk / Issue section dumps that
 * inflate transcript and prompt context without adding new decisions.
 */

/** Max retained repeated dump sections of the same family. */
export const MAX_REPEATED_SECTION_DUMPS = 5;

/**
 * Hard character ceiling for a single persisted agent turn after normalization.
 * Sized for one primary stream plus at most one continuation (~4.2k tokens).
 */
export const AGENT_TURN_OUTPUT_HARD_CAP_CHARS = 14_000;

const DUMP_SECTION_HEADING =
  /^#{1,3}\s+.*\b(bottleneck|risk|issue)s?\b.*$/gim;

const DUMP_SECTION_SPLIT =
  /(?=^#{1,3}\s+.*\b(?:bottleneck|risk|issue)s?\b.*$)/gim;

export interface SectionDumpDiagnostics {
  readonly beforeDumpSectionCount: number;
  readonly afterDumpSectionCount: number;
  readonly wasNormalized: boolean;
  readonly wasHardCapped: boolean;
  readonly originalCharCount: number;
  readonly finalCharCount: number;
}

export interface NormalizedAgentOutput {
  readonly content: string;
  readonly diagnostics: SectionDumpDiagnostics;
}

function countDumpSections(text: string): number {
  return (text.match(DUMP_SECTION_HEADING) ?? []).length;
}

function isDumpSection(part: string): boolean {
  const headingOnly = /^#{1,3}\s+.*\b(bottleneck|risk|issue)s?\b/im;
  return headingOnly.test(part);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function splitDumpPart(part: string): {
  readonly heading: string;
  readonly body: string;
  readonly tail: string;
} {
  const lines = part.split("\n");
  const heading = lines[0] ?? "";
  const bodyLines: string[] = [];
  let tailStart = lines.length;

  for (let index = 1; index < lines.length; index += 1) {
    if (/^#{1,6}\s+/.test(lines[index] ?? "")) {
      tailStart = index;
      break;
    }
    bodyLines.push(lines[index] ?? "");
  }

  return {
    heading,
    body: bodyLines.join("\n"),
    tail: lines.slice(tailStart).join("\n"),
  };
}

function collapseRepeatedHalves(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length < 40) {
    return body;
  }

  const paragraphs = trimmed.split(/\n\n+/);
  if (paragraphs.length >= 2 && paragraphs.length % 2 === 0) {
    const midpoint = paragraphs.length / 2;
    const first = paragraphs.slice(0, midpoint).join("\n\n");
    const second = paragraphs.slice(midpoint).join("\n\n");
    if (normalizeWhitespace(first) === normalizeWhitespace(second)) {
      return first;
    }
  }

  return body;
}

const DUMP_BULLET_SPLIT = /(?=^(?:[-*] |\*\*))/m;

function dedupeIdenticalBullets(body: string): string {
  const chunks = body.split(DUMP_BULLET_SPLIT);
  if (chunks.length <= 1) {
    return body;
  }

  const seenSignatures = new Set<string>();
  const kept: string[] = [];

  for (const chunk of chunks) {
    const signature = normalizeWhitespace(chunk);
    if (signature.length === 0) {
      kept.push(chunk);
      continue;
    }
    if (seenSignatures.has(signature)) {
      continue;
    }
    seenSignatures.add(signature);
    kept.push(chunk);
  }

  return kept.join("");
}

function collapseDumpPart(part: string): string {
  const { heading, body, tail } = splitDumpPart(part);
  const collapsed = dedupeIdenticalBullets(collapseRepeatedHalves(body));
  const headingBlock = collapsed.length > 0 ? `${heading}\n${collapsed}` : heading;
  return tail.length > 0 ? `${headingBlock}\n${tail}` : headingBlock;
}

function collapseIntraSectionDumpDuplicates(text: string): string {
  const parts = text.split(DUMP_SECTION_SPLIT);
  if (parts.length <= 1) {
    return isDumpSection(text) ? collapseDumpPart(text) : text;
  }

  return parts
    .map((part) => (isDumpSection(part) ? collapseDumpPart(part) : part))
    .join("");
}

function retainLimitedDumpSections(text: string): string {
  const parts = text.split(DUMP_SECTION_SPLIT);
  if (parts.length <= 1) {
    return text;
  }

  let dumpSeen = 0;
  const keptSignaturesByFamily = new Map<string, string[]>();
  const kept: string[] = [];

  for (const part of parts) {
    if (!isDumpSection(part)) {
      kept.push(part);
      continue;
    }

    const signature = sectionSignature(part);
    const family = sectionFamily(part);
    const priorSignatures = keptSignaturesByFamily.get(family) ?? [];

    if (
      priorSignatures.some((prior) => isRedundantDumpSection(prior, signature))
    ) {
      continue;
    }

    const supersededIndex = priorSignatures.findIndex((prior) =>
      isRedundantDumpSection(signature, prior),
    );
    if (supersededIndex >= 0) {
      const supersededSignature = priorSignatures[supersededIndex]!;
      replaceKeptDumpSection(kept, family, supersededSignature, part);
      const nextSignatures = [...priorSignatures];
      nextSignatures[supersededIndex] = signature;
      keptSignaturesByFamily.set(family, nextSignatures);
      continue;
    }

    dumpSeen += 1;
    if (dumpSeen <= MAX_REPEATED_SECTION_DUMPS) {
      kept.push(part);
      keptSignaturesByFamily.set(family, [...priorSignatures, signature]);
    }
  }

  return kept.join("").trimEnd();
}

/**
 * Identity of a dump section: its heading plus its own body, stopping at the
 * next markdown heading (the split part also carries following non-dump
 * sections, so the raw part is not a reliable comparison key).
 */
function sectionSignature(part: string): string {
  const lines = part.split("\n");
  const heading = lines[0] ?? "";
  const bodyLines: string[] = [];

  for (const line of lines.slice(1)) {
    if (/^#{1,6}\s+/.test(line)) {
      break;
    }
    bodyLines.push(line);
  }

  return `${heading}\n${bodyLines.join("\n")}`
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function replaceKeptDumpSection(
  kept: string[],
  family: string,
  oldSignature: string,
  replacement: string,
): void {
  for (let index = 0; index < kept.length; index += 1) {
    const candidate = kept[index];
    if (!candidate || !isDumpSection(candidate)) {
      continue;
    }
    if (sectionFamily(candidate) !== family) {
      continue;
    }
    if (sectionSignature(candidate) === oldSignature) {
      kept[index] = replacement;
      return;
    }
  }
}

function sectionFamily(part: string): string {
  return (part.split("\n")[0] ?? "")
    .replace(/\s*\((?:continued|cont\.?)\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * A dump section is redundant when it repeats an earlier same-family section
 * exactly, or when it is fully contained in one (a pure re-emission without new
 * content). A later same-family superset replaces the earlier subset so only
 * the richer copy remains.
 */
function splitNormalizedBullets(signature: string): string[] {
  return signature
    .split(/ (?=[-*] |\*\*)/)
    .slice(1)
    .map((bullet) => bullet.trim())
    .filter((bullet) => bullet.length > 0);
}

function stripTrailingPunctuation(text: string): string {
  return text.replace(/[.;]+$/g, "").trim();
}

function bulletCovers(candidate: string, target: string): boolean {
  if (candidate.includes(target)) {
    return true;
  }
  const candidatePrefix = stripTrailingPunctuation(candidate);
  const targetPrefix = stripTrailingPunctuation(target);
  return candidatePrefix.startsWith(targetPrefix);
}

function dumpBulletKey(bullet: string): string {
  const riskNumber = bullet.match(/\*\*\s*(?:risk\s+)?(\d+)/i);
  if (riskNumber?.[1]) {
    return `risk:${riskNumber[1]}`;
  }
  const boldLabel = bullet.match(/\*\*\s*([^*:]+)/);
  if (boldLabel?.[1]) {
    return boldLabel[1].replace(/\s+/g, " ").trim().toLowerCase();
  }
  return bullet.slice(0, 48);
}

function isKeySubset(subset: string, superset: string): boolean {
  const subsetKeys = splitNormalizedBullets(subset).map(dumpBulletKey);
  if (subsetKeys.length === 0) {
    return false;
  }
  const supersetKeys = new Set(splitNormalizedBullets(superset).map(dumpBulletKey));
  return subsetKeys.every((key) => supersetKeys.has(key));
}

function isSubsetDumpContent(subset: string, superset: string): boolean {
  if (subset.length > 0 && superset.includes(subset)) {
    return true;
  }

  const subsetBullets = splitNormalizedBullets(subset);
  const supersetBullets = splitNormalizedBullets(superset);
  if (subsetBullets.length === 0) {
    return false;
  }

  return subsetBullets.every((bullet) =>
    supersetBullets.some((candidate) => bulletCovers(candidate, bullet)),
  );
}

function isRedundantDumpSection(prior: string, next: string): boolean {
  if (prior === next) {
    return true;
  }
  if (isSubsetDumpContent(next, prior)) {
    return true;
  }
  return isKeySubset(next, prior) && next.length < prior.length;
}

function applyHardCap(text: string): { content: string; wasHardCapped: boolean; } {
  if (text.length <= AGENT_TURN_OUTPUT_HARD_CAP_CHARS) {
    return { content: text, wasHardCapped: false };
  }

  const truncated = text.slice(0, AGENT_TURN_OUTPUT_HARD_CAP_CHARS).trimEnd();
  return {
    content: `${truncated}\n\n…[turnOutputHardCap: truncated]…`,
    wasHardCapped: true,
  };
}

/**
 * Normalize pathological section dumps and enforce the per-turn hard cap
 * before transcript persistence.
 */
export function normalizeSectionDumpOutput(text: string): NormalizedAgentOutput {
  const originalCharCount = text.length;
  const beforeDumpSectionCount = countDumpSections(text);
  const withoutExtraDumps = retainLimitedDumpSections(text);
  const withoutIntraSectionDupes = collapseIntraSectionDumpDuplicates(withoutExtraDumps);
  const afterDumpSectionCount = countDumpSections(withoutIntraSectionDupes);
  const { content, wasHardCapped } = applyHardCap(withoutIntraSectionDupes);

  return {
    content,
    diagnostics: {
      beforeDumpSectionCount,
      afterDumpSectionCount,
      wasNormalized:
        beforeDumpSectionCount !== afterDumpSectionCount ||
        withoutExtraDumps !== withoutIntraSectionDupes,
      wasHardCapped,
      originalCharCount,
      finalCharCount: content.length,
    },
  };
}
