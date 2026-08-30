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

function sectionFamily(part: string): string {
  return (part.split("\n")[0] ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * A dump section is redundant when it repeats an earlier same-family section
 * exactly, or when it is fully contained in one (a pure re-emission without new
 * content). Superset repeats that add new bullets are kept so no information is
 * lost.
 */
function isRedundantDumpSection(prior: string, next: string): boolean {
  if (prior === next) {
    return true;
  }
  return next.length > 0 && prior.includes(next);
}

function applyHardCap(text: string): { content: string; wasHardCapped: boolean } {
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
  const afterDumpSectionCount = countDumpSections(withoutExtraDumps);
  const { content, wasHardCapped } = applyHardCap(withoutExtraDumps);

  return {
    content,
    diagnostics: {
      beforeDumpSectionCount,
      afterDumpSectionCount,
      wasNormalized: beforeDumpSectionCount !== afterDumpSectionCount,
      wasHardCapped,
      originalCharCount,
      finalCharCount: content.length,
    },
  };
}
