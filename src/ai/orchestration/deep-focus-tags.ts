import { SIMULATION_AGENT_ORDER } from "@/ai/agents/config";
import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";

const PIPELINE_ROLES = SIMULATION_AGENT_ORDER.filter(
  (role) => role !== "reviewer",
) as readonly SimulationAgentRole[];

const CHALLENGE_TAG = /\[CHALLENGE:\s*([^\]]+?)\s*\]/gi;
const EVIDENCE_TAG = /\[EVIDENCE:\s*([^\]]+?)\s*\]/gi;
const BLOCKED_TAG = /\[BLOCKED:\s*([^\]]+?)\s*\]/gi;

const EVIDENCE_TOKEN_MAX_CHARS = 80;

export interface DeepFocusTags {
  readonly challenges: readonly SimulationAgentRole[];
  readonly evidence: readonly string[];
  readonly blocked: readonly string[];
}

function uniqueRoles(
  roles: readonly SimulationAgentRole[],
): SimulationAgentRole[] {
  return PIPELINE_ROLES.filter((role) => roles.includes(role));
}

function uniqueTokens(tokens: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of tokens) {
    const normalized = token.replace(/\s+/g, " ").trim().slice(0, EVIDENCE_TOKEN_MAX_CHARS);
    if (!normalized || seen.has(normalized.toLowerCase())) {
      continue;
    }
    seen.add(normalized.toLowerCase());
    result.push(normalized);
  }
  return result;
}

function isPipelineRole(value: string): value is SimulationAgentRole {
  return (PIPELINE_ROLES as readonly string[]).includes(value);
}

export function resolveChallengeTarget(
  identifier: string,
  roster?: TeamRoster,
): SimulationAgentRole | null {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized || normalized === "reviewer") {
    return null;
  }
  if (isPipelineRole(normalized)) {
    return normalized;
  }
  if (!roster) {
    return null;
  }
  for (const role of PIPELINE_ROLES) {
    if (roster[role].name.trim().toLowerCase() === normalized) {
      return role;
    }
  }
  return null;
}

export function parseDeepFocusTags(
  text: string,
  roster?: TeamRoster,
): DeepFocusTags {
  const challenges: SimulationAgentRole[] = [];
  for (const match of text.matchAll(CHALLENGE_TAG)) {
    const role = resolveChallengeTarget(match[1]!, roster);
    if (role) {
      challenges.push(role);
    }
  }

  const evidence: string[] = [];
  for (const match of text.matchAll(EVIDENCE_TAG)) {
    evidence.push(match[1]!);
  }

  const blocked: string[] = [];
  for (const match of text.matchAll(BLOCKED_TAG)) {
    blocked.push(match[1]!);
  }

  return {
    challenges: uniqueRoles(challenges),
    evidence: uniqueTokens(evidence),
    blocked: uniqueTokens(blocked),
  };
}

export function hasDeepFocusChallengeTag(
  text: string,
  roster?: TeamRoster,
): boolean {
  return parseDeepFocusTags(text, roster).challenges.length > 0;
}

export function excerptAroundChallengeTag(
  text: string,
  targetRole: SimulationAgentRole,
  roster?: TeamRoster,
): string | null {
  const identifiers: string[] = [targetRole];
  const displayName = roster?.[targetRole]?.name.trim();
  if (displayName) {
    identifiers.push(displayName);
  }

  for (const identifier of identifiers) {
    const pattern = new RegExp(
      `\\[CHALLENGE:\\s*${identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\]`,
      "i",
    );
    const match = pattern.exec(text);
    if (!match || match.index === undefined) {
      continue;
    }

    const windowStart = Math.max(0, match.index - 120);
    const windowEnd = Math.min(text.length, match.index + match[0].length + 200);
    const excerpt = text.slice(windowStart, windowEnd).replace(/\s+/g, " ").trim();
    return excerpt.length >= 20 ? excerpt : match[0];
  }

  return null;
}
