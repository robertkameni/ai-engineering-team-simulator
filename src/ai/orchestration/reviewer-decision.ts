import {
  isSimulationAgent,
  type SimulationAgentRole,
} from "@/ai/agents/config";

export const MAX_SIMULATION_TURNS = 24;

const TERMINAL_REGION_CHARS = 400;
const MAX_TAIL_AFTER_TAG_CHARS = 60;

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
  | "unknown_reject_fallback";

export interface ParsedReviewerDecision {
  displayText: string;
  decision: ReviewerDecision;
  rejectRole?: SimulationAgentRole;
}

type ExtractedDecisionTag =
  | { kind: "approve"; tagStart: number; tagEnd: number }
  | { kind: "reject"; role: string; tagStart: number; tagEnd: number };

const REJECT_TAG_IN_TEXT =
  /\[REJECT:\s*(pm|architect|backend|frontend|devops|reviewer)\s*\]/gi;

function isRejectableRole(role: string): role is RejectableRole {
  return (REJECTABLE_ROLES as readonly string[]).includes(role);
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
): ExtractedDecisionTag | null {
  const trimmed = raw.trimEnd();
  if (!trimmed) {
    return null;
  }

  const regionStart = Math.max(0, trimmed.length - TERMINAL_REGION_CHARS);
  const approveNeedle = "[APPROVE]";

  let best: { tagStart: number; tagEnd: number; tag: ExtractedDecisionTag } | null =
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
    const candidate = {
      tagStart: idx,
      tagEnd,
      tag: {
        kind: "reject" as const,
        role: match[1]!.toLowerCase(),
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

export function stripReviewerDecisionTag(text: string): string {
  const tag = extractReviewerDecisionTag(text);
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

export function parseReviewerDecision(raw: string): ParsedReviewerDecision {
  const trimmed = raw.trimEnd();
  const tag = extractReviewerDecisionTag(trimmed);

  if (!tag) {
    return {
      displayText: trimmed,
      decision: "unknown",
    };
  }

  if (tag.kind === "approve") {
    return {
      displayText: stripReviewerDecisionTag(trimmed),
      decision: "approve",
    };
  }

  const role = tag.role;
  if (isRejectableRole(role) && isSimulationAgent(role)) {
    return {
      displayText: stripReviewerDecisionTag(trimmed),
      decision: "reject",
      rejectRole: role,
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
      const outcome = (parsed as { debateOutcome: unknown }).debateOutcome;
      if (
        outcome === "approved" ||
        outcome === "cap_reached" ||
        outcome === "unknown_reject_fallback"
      ) {
        return outcome;
      }
    }
  } catch {
    return null;
  }

  return null;
}
