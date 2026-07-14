// STRUCTURED RESOLUTION TRACKING
// REVIEW ISSUE STATE
//
// Tracks reviewer-identified issues as structured items with explicit lifecycle
// states across correction cycles. Replaces unstructured feedback circulation
// with a typed, traceable issue model.

import type { SimulationAgentRole } from "@/ai/agents/config";

export type IssueStatus = "open" | "attempted" | "addressed" | "still_open" | "failed_validation";

export interface ReviewIssue {
  /** Unique identifier within a run (derived from topic key + index). */
  id: string;
  /** The role the reviewer flagged as needing correction. */
  targetRole: SimulationAgentRole;
  /** Keywords extracted from the concern text for matching. */
  keywords: string[];
  /** Shortened excerpt of the original reviewer concern. */
  excerpt: string;
  /** Current lifecycle state. */
  status: IssueStatus;
  /** Which rejection cycle created this issue (0-indexed). */
  createdOnCycle: number;
  /** Which correction turn last attempted to address this (turn count). */
  lastAttemptedOnTurn: number | null;
  /** Which turn last confirmed this as still open (turn count). */
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

/** Returns issues that reference the given role and concern text. */
function findForRole(
  issues: ReviewIssue[],
  targetRole: SimulationAgentRole,
  concernText: string,
): ReviewIssue[] {
  // Normalize concern text identically to how createReviewIssues does it
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

/**
 * Creates new issues from reviewer rejection feedback.
 * Deduplicates against existing issues for the same role.
 *
 * STRUCTURED RESOLUTION TRACKING
 */
export function createReviewIssues(
  existingIssues: ReviewIssue[],
  targetRole: SimulationAgentRole,
  feedbackText: string,
  cycleIndex: number,
  turnCount: number,
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
    const existing = findForRole(existingIssues, targetRole, concern);
    if (existing.length > 0) {
      // Reactivate existing issues as still open
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
      targetRole,
      keywords,
      excerpt: normalizeExcerpt(concern),
      status: "open",
      createdOnCycle: cycleIndex,
      lastAttemptedOnTurn: null,
      lastConfirmedOnTurn: turnCount,
    });
  }

  return newIssues;
}

/**
 * Marks issues for a given role as attempted when a correction turn is produced.
 *
 * REVIEW ISSUE STATE — correction attempt
 */
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

/**
 * Marks issues as failed when a correction turn fails validation.
 *
 * REVIEW ISSUE STATE — validation failure
 */
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

/**
 * Marks issues as addressed when the reviewer approves the run.
 *
 * REVIEW ISSUE STATE — resolution
 */
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
