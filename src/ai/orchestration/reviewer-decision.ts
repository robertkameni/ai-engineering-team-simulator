import {
  isSimulationAgent,
  SIMULATION_AGENT_ORDER,
  type SimulationAgentRole,
} from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";

export const MAX_SIMULATION_TURNS = 16;
export const MIN_TURNS_FOR_REVISION_FINISH = 4;

export function canScheduleArchitectRevision(turnCount: number): boolean {
  return turnCount + MIN_TURNS_FOR_REVISION_FINISH <= MAX_SIMULATION_TURNS;
}

/** After this many reviewer [REJECT] decisions, debate exits with cap_reached.
 *  Raised from 2 → 4 to allow more granular per-role correction cycles
 *  before global debate closure. Per-role caps (MAX_CORRECTIONS_PER_ROLE = 2)
 *  still prevent individual roles from being corrected infinitely. */
export const MAX_REVIEWER_REJECTION_CYCLES = 4;

export function hasExceededReviewerRejectionCap(rejectionCount: number): boolean {
  return rejectionCount >= MAX_REVIEWER_REJECTION_CYCLES;
}

const TERMINAL_REGION_CHARS = 600;
const MAX_TAIL_AFTER_TAG_CHARS = 120;

const REJECTABLE_ROLES = [
  "pm",
  "architect",
  "backend",
  "frontend",
  "devops",
] as const;

type RejectableRole = (typeof REJECTABLE_ROLES)[number];

export type ReviewerDecision = "approve" | "reject" | "unknown";

export type DebateExitOutcome =
  | "approved"
  | "cap_reached"
  | "unknown_reject_fallback"
  | "reviewer_error";

export interface ParsedReviewerDecision {
  displayText: string;
  decision: ReviewerDecision;
  rejectRole?: SimulationAgentRole;
}

type ExtractedDecisionTag =
  | { kind: "approve"; tagStart: number; tagEnd: number; }
  | { kind: "reject"; role: string; tagStart: number; tagEnd: number; };

const REJECT_TAG_IN_TEXT = /\[REJECT:\s*([^\]]+?)\s*\]/gi;

function isRejectableRole(role: string): role is RejectableRole {
  return (REJECTABLE_ROLES as readonly string[]).includes(role);
}

/** Maps a role slug or roster display name to a correction target role. */
export function resolveRejectIdentifier(
  identifier: string,
  roster?: TeamRoster,
): SimulationAgentRole | null {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized || normalized === "reviewer") {
    return null;
  }

  if (isRejectableRole(normalized) && isSimulationAgent(normalized)) {
    return normalized;
  }

  if (!roster) {
    return null;
  }

  for (const role of SIMULATION_AGENT_ORDER) {
    if (role === "reviewer") {
      continue;
    }
    if (roster[role].name.trim().toLowerCase() === normalized) {
      return role;
    }
  }

  return null;
}

function isBoundedConversationalTail(tail: string): boolean {
  if (tail.length > MAX_TAIL_AFTER_TAG_CHARS) {
    return false;
  }
  if (tail.includes("[")) {
    return false;
  }
  return /^[\s.!?,;:—–\-–»"'`()\w]*$/u.test(tail);
}

/** Analyzes the terminal region for a valid decision tag with optional short tail. */
export function extractReviewerDecisionTag(
  raw: string,
  roster?: TeamRoster,
): ExtractedDecisionTag | null {
  const trimmed = raw.trimEnd();
  if (!trimmed) {
    return null;
  }

  const regionStart = Math.max(0, trimmed.length - TERMINAL_REGION_CHARS);
  const approveNeedle = "[APPROVE]";

  let best: { tagStart: number; tagEnd: number; tag: ExtractedDecisionTag; } | null =
    null;

  let searchFrom = trimmed.length;
  while (searchFrom > 0) {
    const idx = trimmed.lastIndexOf(approveNeedle, searchFrom - 1);
    if (idx === -1 || idx < regionStart) {
      break;
    }
    const tagEnd = idx + approveNeedle.length;
    const tail = trimmed.slice(tagEnd);
    if (isBoundedConversationalTail(tail)) {
      const candidate = {
        tagStart: idx,
        tagEnd,
        tag: { kind: "approve" as const, tagStart: idx, tagEnd },
      };
      if (!best || idx > best.tagStart) {
        best = candidate;
      }
    }
    searchFrom = idx;
  }

  const rejectMatches = [...trimmed.matchAll(REJECT_TAG_IN_TEXT)];
  for (const match of rejectMatches) {
    const idx = match.index;
    if (idx === undefined || idx < regionStart) {
      continue;
    }
    const tagEnd = idx + match[0].length;
    const tail = trimmed.slice(tagEnd);
    if (!isBoundedConversationalTail(tail)) {
      continue;
    }
    const roleIdentifier = match[1]!.trim();
    if (!resolveRejectIdentifier(roleIdentifier, roster)) {
      continue;
    }
    const candidate = {
      tagStart: idx,
      tagEnd,
      tag: {
        kind: "reject" as const,
        role: roleIdentifier,
        tagStart: idx,
        tagEnd,
      },
    };
    if (!best || idx > best.tagStart) {
      best = candidate;
    }
  }

  return best?.tag ?? null;
}

export function stripReviewerDecisionTag(
  text: string,
  roster?: TeamRoster,
): string {
  const tag = extractReviewerDecisionTag(text, roster);
  if (!tag) {
    return text.trimEnd();
  }
  return text.slice(0, tag.tagStart).trimEnd();
}

/** Hides complete or in-progress decision tags during reviewer streaming. */
export function reviewerVisibleText(fullText: string): string {
  let text = stripReviewerDecisionTag(fullText.trimEnd());
  text = text.replace(/\s*\[(?:APPROVE|REJECT(?::[^\]]*)?)?\]?$/i, "");
  return text;
}

export function parseReviewerDecision(
  raw: string,
  roster?: TeamRoster,
): ParsedReviewerDecision {
  const trimmed = raw.trimEnd();
  const tag = extractReviewerDecisionTag(trimmed, roster);

  if (!tag) {
    return {
      displayText: trimmed,
      decision: "unknown",
    };
  }

  if (tag.kind === "approve") {
    return {
      displayText: stripReviewerDecisionTag(trimmed, roster),
      decision: "approve",
    };
  }

  const rejectRole = resolveRejectIdentifier(tag.role, roster);
  if (rejectRole) {
    return {
      displayText: stripReviewerDecisionTag(trimmed, roster),
      decision: "reject",
      rejectRole,
    };
  }

  return {
    displayText: trimmed,
    decision: "unknown",
  };
}

export function resolveUnknownReviewerDecision(): ParsedReviewerDecision {
  return {
    displayText: "",
    decision: "reject",
    rejectRole: "pm",
  };
}

export interface DebateMessage {
  agentRole: string;
  content: string;
}

/** Legacy runs: reviewer spoke last with no decision tags in content. */
export function isLegacyUntaggedReviewerCompletion(message: DebateMessage): boolean {
  if (message.agentRole !== "reviewer") {
    return false;
  }
  const content = message.content;
  if (/\[APPROVE\]/i.test(content)) {
    return false;
  }
  if (/\[REJECT:/i.test(content)) {
    return false;
  }
  return true;
}

export function isDebateComplete(messages: DebateMessage[]): boolean {
  if (messages.length === 0) {
    return false;
  }

  if (messages.length >= MAX_SIMULATION_TURNS) {
    return true;
  }

  const last = messages[messages.length - 1]!;
  if (last.agentRole !== "reviewer") {
    return false;
  }

  if (isLegacyUntaggedReviewerCompletion(last)) {
    return true;
  }

  const { decision } = parseReviewerDecision(last.content);
  return decision === "approve";
}

export function parseDebateOutcomeFromRunSummary(
  summary: string | null,
): DebateExitOutcome | null {
  if (!summary?.trim()) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(summary);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "debateOutcome" in parsed
    ) {
      const outcome = (parsed as { debateOutcome: unknown; }).debateOutcome;
      if (
        outcome === "approved" ||
        outcome === "cap_reached" ||
        outcome === "unknown_reject_fallback" ||
        outcome === "reviewer_error"
      ) {
        return outcome;
      }
    }
  } catch {
    return null;
  }

  return null;
}
