import type { SimulationAgentRole } from "@/ai/agents/config";
import { getTeamMember, type TeamRoster } from "@/ai/agents/roster";
import type { TranscriptEntry } from "@/ai/context/transcript";

export interface CriticismResult {
  criticized: boolean;
  excerpts: string[];
}

const CRITICAL_PATTERNS: RegExp[] = [
  /\bweakness(es)?\b/i,
  /\b(replacing|replace|drop|remove)\b/i,
  /\bhalf-measure\b/i,
  /\b(?:issue|problem|flaw|gap)s?\b/i,
  /\b(reject|disagree)\b/i,
  /\bchalleng\w*\b/i,
  /\bpush(?:es|ed)?\s+back\b/i,
  /\btake(?:s)?\s+issue\b/i,
  /\bunnecessary\b/i,
  /\bover-?engineer(?:ed|ing)?\b/i,
  /\boverkill\b/i,
  /\bdoes not account\b/i,
  /\bdoes not (handle|cover|address|consider)\b/i,
  /\bI will (change|modify|alter|revise|keep|add)\b/i,
  /\boperational (weakness|gap|concern)\b/i,
  /\bthis is (wrong|incorrect|problematic|insufficient)\b/i,
];

const EXCERPT_MIN_CHARS = 20;
const EXCERPT_MAX_CHARS = 700;
const EXCERPT_CONTEXT_BEFORE_CHARS = 140;
const EXCERPT_CONTEXT_AFTER_CHARS = 380;

function findFirstCriticalMatch(text: string): number | null {
  for (const pattern of CRITICAL_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      return match.index;
    }
  }
  return null;
}

/**
 * Trims a critique paragraph into a reviewer-usable excerpt. Short paragraphs
 * pass through verbatim; long paragraphs are windowed around the first
 * critical-language match so a substantive critique is never dropped purely
 * because the surrounding paragraph is verbose.
 */
function extractCritiqueExcerpt(paragraph: string): string | null {
  const cleaned = paragraph.replace(/\n+/g, " ").trim();
  if (cleaned.length < EXCERPT_MIN_CHARS) {
    return null;
  }

  if (cleaned.length <= EXCERPT_MAX_CHARS) {
    return cleaned;
  }

  const matchIndex = findFirstCriticalMatch(cleaned);
  if (matchIndex == null) {
    return cleaned.slice(0, EXCERPT_MAX_CHARS);
  }

  const start = Math.max(0, matchIndex - EXCERPT_CONTEXT_BEFORE_CHARS);
  const end = Math.min(
    cleaned.length,
    matchIndex + EXCERPT_CONTEXT_AFTER_CHARS,
  );
  const excerpt = cleaned.slice(start, end).trim();
  return excerpt.length >= EXCERPT_MIN_CHARS ? excerpt : null;
}

/**
 * Scans the transcript for substantive critiques directed at a specific agent
 * by teammates who spoke after them.
 */
export function detectPeerCriticism(
  transcript: TranscriptEntry[],
  targetName: string,
  criticRoles: SimulationAgentRole[],
): CriticismResult {
  const excerpts: string[] = [];

  for (const entry of transcript) {
    if (!criticRoles.includes(entry.role as SimulationAgentRole)) continue;
    if (!entry.content.includes(targetName)) continue;

    const paragraphs = entry.content.split("\n\n");
    for (const paragraph of paragraphs) {
      if (!paragraph.includes(targetName)) continue;
      if (!hasCriticalLanguage(paragraph)) continue;

      const excerpt = extractCritiqueExcerpt(paragraph);
      if (excerpt) {
        excerpts.push(excerpt);
      }
    }
  }

  return { criticized: excerpts.length > 0, excerpts };
}

/**
 * Checks whether any agent in the transcript expressed substantive disagreement
 * with a previous agent. Returns false if the debate is entirely agreeable.
 */
export function hasAnySubstantiveDisagreement(
  transcript: TranscriptEntry[],
  agentNames: string[],
): boolean {
  for (const entry of transcript) {
    for (const name of agentNames) {
      if (name === entry.agentName) continue;
      if (!entry.content.includes(name)) continue;

      if (hasCriticalLanguage(entry.content)) {
        return true;
      }
    }
  }

  return false;
}

function hasCriticalLanguage(text: string): boolean {
  return CRITICAL_PATTERNS.some((pattern) => pattern.test(text));
}

export interface CritiqueEvidence {
  readonly targetRole: SimulationAgentRole;
  readonly excerpt: string;
}

export interface RoleCritiqueSummary {
  readonly role: SimulationAgentRole;
  readonly name: string;
  readonly critiques: readonly CritiqueEvidence[];
}

const CRITIQUE_TARGET_ROLES: readonly SimulationAgentRole[] = [
  "pm",
  "architect",
  "backend",
  "frontend",
  "devops",
];

/**
 * Ground-truth cross-critique matrix: for every pipeline role, which teammates
 * it challenged with substantive critical language, with verbatim excerpts.
 * Feeds the reviewer's Cross-Critique Compliance section so the reviewer does
 * not reconstruct attributions from memory (which hallucinates them).
 */
export function buildCritiqueMatrix(
  transcript: readonly TranscriptEntry[],
  roster: TeamRoster,
): RoleCritiqueSummary[] {
  return CRITIQUE_TARGET_ROLES.map((role) => {
    const name = getTeamMember(roster, role).name;
    const critiques: CritiqueEvidence[] = [];

    for (const entry of transcript) {
      if (entry.role !== role) {
        continue;
      }

      for (const targetRole of CRITIQUE_TARGET_ROLES) {
        if (targetRole === role) {
          continue;
        }

        const targetName = getTeamMember(roster, targetRole).name;
        if (!entry.content.includes(targetName)) {
          continue;
        }

        for (const paragraph of entry.content.split("\n\n")) {
          if (!paragraph.includes(targetName)) {
            continue;
          }
          if (!hasCriticalLanguage(paragraph)) {
            continue;
          }

          const excerpt = extractCritiqueExcerpt(paragraph);
          if (excerpt) {
            critiques.push({ targetRole, excerpt });
          }
        }
      }
    }

    return { role, name, critiques: critiques.slice(0, 3) };
  });
}
