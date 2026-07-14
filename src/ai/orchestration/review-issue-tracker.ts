import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";
import {
  inferIssueOwnerFromConcern,
  inferIssueSeverity,
  type IssueSeverity,
} from "@/ai/orchestration/issue-ownership";

export type IssueStatus = "open" | "attempted" | "addressed" | "still_open" | "failed_validation";

export interface ReviewIssue {
  id: string;
  targetRole: SimulationAgentRole;
  keywords: string[];
  excerpt: string;
  status: IssueStatus;
  severity: IssueSeverity;
  createdOnCycle: number;
  lastAttemptedOnTurn: number | null;
  lastConfirmedOnTurn: number | null;
}

export interface ReviewIssueSnapshot {
  issues: ReviewIssue[];
  totalCreated: number;
  totalOpen: number;
  totalFailed: number;
}

let issueCounter = 0;

function nextId(): string {
  issueCounter += 1;
  return `ri_${issueCounter}`;
}

const EXCERPT_MAX_CHARS = 200;

function normalizeExcerpt(raw: string): string {
  const cleaned = raw.replace(/\*\*(?:Disagree|Refine|UNRESOLVED)\*\*[-:]*\s*/gi, "").trim();
  if (cleaned.length <= EXCERPT_MAX_CHARS) {
    return cleaned;
  }
  return `${cleaned.slice(0, EXCERPT_MAX_CHARS).trimEnd()}…`;
}

const STOP_WORDS = new Set([
  "this", "that", "with", "from", "have", "been", "were", "them",
  "then", "than", "will", "also", "when", "what", "which", "where",
  "does", "into", "just", "more", "some", "such", "need", "needs",
  "could", "would", "should", "about", "after",
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w))
    .slice(0, 6);
}

function buildDedupeKey(targetRole: SimulationAgentRole, keywords: string[]): string {
  const key = keywords.slice(0, 3).join("|");
  return `${targetRole}:${key}`;
}

function findForRole(
  issues: ReviewIssue[],
  targetRole: SimulationAgentRole,
  concernText: string,
): ReviewIssue[] {
  const normalized = normalizeExcerpt(concernText);
  const concernKeywords = extractKeywords(normalized);
  const dedupeKey = buildDedupeKey(targetRole, concernKeywords);

  return issues.filter((issue) => {
    if (issue.targetRole !== targetRole) {
      return false;
    }
    const issueKey = buildDedupeKey(issue.targetRole, issue.keywords);
    if (issueKey === dedupeKey) {
      return true;
    }
    const overlap = issue.keywords.filter((kw) => concernKeywords.includes(kw)).length;
    return overlap >= Math.min(3, issue.keywords.length);
  });
}

export function createReviewIssues(
  existingIssues: ReviewIssue[],
  rejectRole: SimulationAgentRole,
  feedbackText: string,
  cycleIndex: number,
  turnCount: number,
  roster: TeamRoster,
): ReviewIssue[] {
  const concerns = feedbackText
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length >= 20 &&
        (/\*\*Disagree\*\*/i.test(line) ||
          /\*\*Refine\*\*/i.test(line) ||
          /\bUNRESOLVED\b/i.test(line) ||
          /\bmissing\b/i.test(line) ||
          (line.startsWith("**") && line.length >= 30)),
    );

  const newIssues: ReviewIssue[] = [];

  for (const concern of concerns) {
    const issueOwner = inferIssueOwnerFromConcern(concern, roster, rejectRole);
    const existing = findForRole(existingIssues, issueOwner, concern);
    if (existing.length > 0) {
      for (const issue of existing) {
        issue.status = "still_open";
        issue.lastConfirmedOnTurn = turnCount;
      }
      continue;
    }

    const excerpt = normalizeExcerpt(concern);
    const keywords = extractKeywords(excerpt);
    if (keywords.length < 2) {
      continue;
    }

    newIssues.push({
      id: nextId(),
      targetRole: issueOwner,
      keywords,
      excerpt: normalizeExcerpt(concern),
      status: "open",
      severity: inferIssueSeverity(concern),
      createdOnCycle: cycleIndex,
      lastAttemptedOnTurn: null,
      lastConfirmedOnTurn: turnCount,
    });
  }

  return newIssues;
}

export function markIssuesAttempted(
  issues: ReviewIssue[],
  targetRole: SimulationAgentRole,
  turnCount: number,
): void {
  for (const issue of issues) {
    if (issue.targetRole !== targetRole) {
      continue;
    }
    if (issue.status === "open" || issue.status === "still_open") {
      issue.status = "attempted";
      issue.lastAttemptedOnTurn = turnCount;
    }
  }
}

export function markIssuesFailedValidation(
  issues: ReviewIssue[],
  targetRole: SimulationAgentRole,
): void {
  for (const issue of issues) {
    if (issue.targetRole !== targetRole) {
      continue;
    }
    if (issue.status !== "addressed") {
      issue.status = "failed_validation";
    }
  }
}

export function markIssuesAddressed(issues: ReviewIssue[]): void {
  for (const issue of issues) {
    if (issue.status !== "addressed") {
      issue.status = "addressed";
    }
  }
}

export function buildIssueSnapshot(issues: ReviewIssue[]): ReviewIssueSnapshot {
  return {
    issues,
    totalCreated: issues.length,
    totalOpen: issues.filter((i) => i.status === "open" || i.status === "still_open").length,
    totalFailed: issues.filter(
      (i) => i.status === "failed_validation",
    ).length,
  };
}
