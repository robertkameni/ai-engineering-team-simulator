import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";
import { inferIssueOwnerFromConcern } from "@/ai/orchestration/issue-ownership";

export type ProseCriticalRiskCategory =
  | "security"
  | "data_loss"
  | "architectural_impossibility";

export interface ProseCriticalRisk {
  readonly issueId: string;
  readonly targetRole: SimulationAgentRole;
  readonly category: ProseCriticalRiskCategory;
  readonly excerpt: string;
}

const CRITICAL_RISKS_SECTION = /^#{1,3}\s+.*critical risks?\s*$/im;

const RISK_ENTRY_SPLIT = /(?=^(?:\*\*\s*(?:risk\s+)?\d+\b|\d+\.\s+\*\*))/im;

const CRITICAL_CATEGORY_PATTERNS: ReadonlyArray<{
  category: ProseCriticalRiskCategory;
  pattern: RegExp;
}> = [
  {
    category: "security",
    pattern:
      /\b(security|auth|authentication|authorization|permission|secret|token|injection|idor|xss|csrf|privilege|encrypt|session)\b/i,
  },
  {
    category: "data_loss",
    pattern:
      /\b(data loss|dataloss|backup|restore|recovery|corrupt|corruption|durability|destructive migration|unrecoverable)\b/i,
  },
  {
    category: "architectural_impossibility",
    pattern:
      /\b(impossible|cannot implement|can't implement|not feasible|architectural impossibility|contradictory architecture|incompatible architecture)\b/i,
  },
];

const UNRESOLVED_SIGNALS: readonly RegExp[] = [
  /\bunresolved\b/i,
  /no(?:\s+\w+){0,4}\s+mechanism/i,
  /\blacks? (?:a )?(?:named\s+)?mechanism\b/i,
  /\bopen (?:data[ -]?loss|security) gap\b/i,
  /not yet implemented/i,
  /remains open/i,
  /\bopen gap\b/i,
  /not adopted/i,
  /i need the concrete mechanism/i,
  /provides no mechanism/i,
  /evidence-free assertion/i,
  /no scheduled job/i,
  /no named test/i,
  /without this,? .{0,120}\b(theater|theatre)\b/i,
  /this is a critical\b/i,
  /\bcritical (?:security|auth|data.?loss).{0,80}\bgap\b/i,
  /\b(?:no|without(?: a)?|missing|lacks?)\s+(?:named\s+)?mitigation\b/i,
  /\bmitigation (?:is )?(?:required|needed|missing|absent)\b/i,
  /\bmust include\b/i,
];

const RESOLVED_SIGNALS: readonly RegExp[] = [
  /\b(?:is|now|has been)?\s*resolved\.?$/im,
  /already present/i,
  /already in /i,
  /now (?:present|addressed|implemented|adopted)/i,
  /\btuning note\b/i,
  /\bnot a blocker\b/i,
  /\bno reject\b/i,
];

function extractCriticalRisksSection(text: string): string {
  const match = text.match(CRITICAL_RISKS_SECTION);
  if (!match || match.index === undefined) {
    return "";
  }
  const rest = text.slice(match.index + match[0].length);
  const nextHeading = rest.search(/^#{1,3}\s+/m);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

function extractRiskEntries(section: string): string[] {
  return section
    .split(RISK_ENTRY_SPLIT)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function classifyCriticalCategory(
  entry: string,
): ProseCriticalRiskCategory | null {
  for (const { category, pattern } of CRITICAL_CATEGORY_PATTERNS) {
    if (pattern.test(entry)) {
      return category;
    }
  }
  return null;
}

function isUnresolved(entry: string): boolean {
  if (RESOLVED_SIGNALS.some((signal) => signal.test(entry))) {
    return false;
  }
  return UNRESOLVED_SIGNALS.some((signal) => signal.test(entry));
}

const EXCERPT_MAX_CHARS = 200;

function normalizeExcerpt(entry: string): string {
  const cleaned = entry.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= EXCERPT_MAX_CHARS) {
    return cleaned;
  }
  return `${cleaned.slice(0, EXCERPT_MAX_CHARS).trimEnd()}…`;
}

function collectCandidateEntries(reviewerMessage: string): string[] {
  const section = extractCriticalRisksSection(reviewerMessage);
  const fromSection = extractRiskEntries(section);
  const fromParagraphs = reviewerMessage
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 40);

  return [...fromSection, ...fromParagraphs];
}

/**
 * Extracts critical risks the final review described as unresolved but that
 * were never promoted into tracked review issues (e.g., introduced after the
 * issue baseline froze). These are exactly the gaps that must surface in
 * `acceptedCriticalRisks` so a run's finalization telemetry is honest.
 */
export function extractUnresolvedProseCriticalRisks(
  reviewerMessage: string,
  roster: TeamRoster,
  fallbackRole: SimulationAgentRole = "architect",
): ProseCriticalRisk[] {
  const risks: ProseCriticalRisk[] = [];
  const covered = new Set<string>();

  for (const [index, entry] of collectCandidateEntries(reviewerMessage).entries()) {
    const category = classifyCriticalCategory(entry);
    if (!category || !isUnresolved(entry)) {
      continue;
    }

    const targetRole = inferIssueOwnerFromConcern(entry, roster, fallbackRole);
    const coverageKey = `${targetRole}:${category}`;
    if (covered.has(coverageKey)) {
      continue;
    }
    covered.add(coverageKey);

    risks.push({
      issueId: `prose_${index + 1}`,
      targetRole,
      category,
      excerpt: normalizeExcerpt(entry),
    });
  }
  return risks;
}
