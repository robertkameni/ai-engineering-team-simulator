import {
  isSimulationAgent,
  type SimulationAgentRole,
} from "@/ai/agents/config";

export const MAX_SIMULATION_TURNS = 8;

const REJECTABLE_ROLES = ["pm", "architect", "backend", "frontend"] as const;

type RejectableRole = (typeof REJECTABLE_ROLES)[number];

export type ReviewerDecision = "approve" | "reject" | "unknown";

export interface ParsedReviewerDecision {
  displayText: string;
  decision: ReviewerDecision;
  rejectRole?: SimulationAgentRole;
}

const APPROVE_TAG_PATTERN = /\s*\[APPROVE\]\s*$/i;
const REJECT_TAG_PATTERN =
  /\s*\[REJECT:\s*(pm|architect|backend|frontend|reviewer)\s*\]\s*$/i;

function isRejectableRole(role: string): role is RejectableRole {
  return (REJECTABLE_ROLES as readonly string[]).includes(role);
}

export function stripReviewerDecisionTag(text: string): string {
  return text.replace(APPROVE_TAG_PATTERN, "").replace(REJECT_TAG_PATTERN, "").trimEnd();
}

/** Hides complete or in-progress decision tags during reviewer streaming. */
export function reviewerVisibleText(fullText: string): string {
  let text = stripReviewerDecisionTag(fullText.trimEnd());
  text = text.replace(/\s*\[(?:APPROVE|REJECT(?::[^\]]*)?)?\]?$/i, "");
  return text;
}

export function parseReviewerDecision(raw: string): ParsedReviewerDecision {
  const trimmed = raw.trimEnd();
  const approveMatch = trimmed.match(APPROVE_TAG_PATTERN);
  if (approveMatch) {
    return {
      displayText: stripReviewerDecisionTag(trimmed),
      decision: "approve",
    };
  }

  const rejectMatch = trimmed.match(REJECT_TAG_PATTERN);
  if (rejectMatch) {
    const role = rejectMatch[1].toLowerCase();
    if (isRejectableRole(role) && isSimulationAgent(role)) {
      return {
        displayText: stripReviewerDecisionTag(trimmed),
        decision: "reject",
        rejectRole: role,
      };
    }
  }

  return {
    displayText: trimmed,
    decision: "unknown",
  };
}

export interface DebateMessage {
  agentRole: string;
  content: string;
}

/** Retrocompatible: 5-message runs without tags count as complete when reviewer spoke last. */
export function isDebateComplete(messages: DebateMessage[]): boolean {
  if (messages.length === 0) {
    return false;
  }

  if (messages.length >= MAX_SIMULATION_TURNS) {
    return true;
  }

  const last = messages[messages.length - 1];
  if (last.agentRole !== "reviewer") {
    return false;
  }

  const { decision } = parseReviewerDecision(last.content);
  return decision === "approve" || decision === "unknown";
}
