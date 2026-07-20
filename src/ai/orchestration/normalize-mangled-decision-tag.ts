import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";
import {
  parseReviewerDecision,
  resolveRejectIdentifier,
  type ParsedReviewerDecision,
} from "@/ai/orchestration/reviewer-decision";

const REJECTABLE_ROLE_SLUGS = [
  "pm",
  "architect",
  "backend",
  "frontend",
  "devops",
] as const;

/** Study-group fixture pattern: nested truncated `[RE` prefixes. */
const MANGLED_RE_PREFIX = /\[(?:RE){2,}/i;

const ROLE_MENTION_NEAR_TAG =
  /\b(pm|architect|backend|frontend|devops|product manager|tech lead|site engineer)\b/gi;

const APPROVE_SIGNAL =
  /\b(?:approve|approved|ready for implementation|no blocking|all (?:critical )?gaps? (?:are |were )?addressed)\b/i;

const REJECT_SIGNAL =
  /\b(?:reject|must fix|still missing|unresolved|blocking|incomplete)\b/i;

function findNearestRoleMention(
  text: string,
  roster?: TeamRoster,
): SimulationAgentRole | null {
  const region = text.slice(Math.max(0, text.length - 800));
  const matches = [...region.matchAll(ROLE_MENTION_NEAR_TAG)];
  if (matches.length === 0 && roster) {
    for (const slug of REJECTABLE_ROLE_SLUGS) {
      const name = roster[slug].name.trim().toLowerCase();
      if (name && region.toLowerCase().includes(name)) {
        return slug;
      }
    }
    return null;
  }

  const last = matches[matches.length - 1];
  if (!last?.[1]) {
    return null;
  }

  return resolveRejectIdentifier(last[1], roster);
}

/**
 * Collapses mangled `[RE[RE[RE…` streams into a clean decision tag using
 * surrounding prose, then re-parses.
 */
export function normalizeMangledReviewerDecisionText(
  raw: string,
  roster?: TeamRoster,
): string {
  const trimmed = raw.trimEnd();
  if (!trimmed) {
    return trimmed;
  }

  // Already a clean parseable tag — leave alone.
  const clean = parseReviewerDecision(trimmed, roster);
  if (clean.decision !== "unknown") {
    return trimmed;
  }

  if (!MANGLED_RE_PREFIX.test(trimmed) && !/\[RE\[RE/i.test(trimmed)) {
    return trimmed;
  }

  const role = findNearestRoleMention(trimmed, roster);
  const prefersApprove =
    APPROVE_SIGNAL.test(trimmed) && !REJECT_SIGNAL.test(trimmed);

  let recoveredTag: string;
  if (prefersApprove) {
    recoveredTag = "[APPROVE]";
  } else if (role) {
    recoveredTag = `[REJECT: ${role}]`;
  } else {
    recoveredTag = "[REJECT: architect]";
  }

  // Strip mangled `[RE…` fragments from the terminal region, then append clean tag.
  const withoutMangled = trimmed
    .replace(/\[(?:RE)+(?:JECT(?::[^\]]*)?)?\]?/gi, "")
    .replace(/\[(?:AP+R*O*V*E*)?\]?/gi, (match) =>
      /^\[APPROVE\]$/i.test(match) ? match : "",
    )
    .trimEnd();

  return `${withoutMangled}\n\n${recoveredTag}`;
}

export function parseReviewerDecisionWithMangleRecovery(
  raw: string,
  roster?: TeamRoster,
): ParsedReviewerDecision {
  const normalized = normalizeMangledReviewerDecisionText(raw, roster);
  return parseReviewerDecision(normalized, roster);
}
