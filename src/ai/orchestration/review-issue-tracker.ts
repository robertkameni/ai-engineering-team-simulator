import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";
import {
  inferIssueOwnerFromConcern,
  inferIssueSeverity,
  type IssueSeverity,
} from "@/ai/orchestration/issue-ownership";

export type IssueStatus = "open" | "addressed" | "accepted_risk";

type AcceptedRiskPrimitive = string | number | boolean | null;

type AcceptedRiskMetadata = Readonly<Record<string, AcceptedRiskPrimitive>>;

export interface IssueAcceptedRisk {
  readonly reason: string;
  readonly acceptedByRole: SimulationAgentRole | "reviewer";
  readonly acceptedOnTurn: number | null;
  readonly metadata?: AcceptedRiskMetadata;
}

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
  acceptedRisk?: IssueAcceptedRisk | null;
}

export interface ReviewIssueSnapshot {
  issues: ReviewIssue[];
  totalCreated: number;
  totalOpen: number;
  totalAddressed: number;
  totalAcceptedRisk: number;
}

export interface ReviewIssueBaseline {
  readonly issueIds: ReadonlySet<string>;
}

export interface BaselineIssueCreationParams {
  readonly existingIssues: ReviewIssue[];
  readonly rejectRole: SimulationAgentRole;
  readonly feedbackText: string;
  readonly cycleIndex: number;
  readonly turnCount: number;
  readonly roster: TeamRoster;
  readonly baseline: ReviewIssueBaseline;
}

export interface BaselineIssueCreationResult {
  readonly newIssues: ReviewIssue[];
  readonly blockedNewIssuesCount: number;
  readonly updatedIssueIds: string[];
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

function createReviewIssuesInternal(
  existingIssues: ReviewIssue[],
  rejectRole: SimulationAgentRole,
  feedbackText: string,
  cycleIndex: number,
  turnCount: number,
  roster: TeamRoster,
  baseline: ReviewIssueBaseline | null,
): BaselineIssueCreationResult {
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
  const updatedIssueIds: string[] = [];
  let blockedNewIssuesCount = 0;

  for (const concern of concerns) {
    const issueOwner = inferIssueOwnerFromConcern(concern, roster, rejectRole);
    const existing = findForRole(existingIssues, issueOwner, concern).filter(
      (issue) => baseline === null || baseline.issueIds.has(issue.id),
    );
    if (existing.length > 0) {
      for (const issue of existing) {
        issue.lastConfirmedOnTurn = turnCount;
        updatedIssueIds.push(issue.id);
      }
      continue;
    }

    const excerpt = normalizeExcerpt(concern);
    const keywords = extractKeywords(excerpt);
    if (keywords.length < 2) {
      continue;
    }

    if (baseline !== null) {
      blockedNewIssuesCount += 1;
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
      acceptedRisk: null,
    });
  }

  return { newIssues, blockedNewIssuesCount, updatedIssueIds };
}

export function createReviewIssues(
  existingIssues: ReviewIssue[],
  rejectRole: SimulationAgentRole,
  feedbackText: string,
  cycleIndex: number,
  turnCount: number,
  roster: TeamRoster,
): ReviewIssue[] {
  return createReviewIssuesInternal(
    existingIssues,
    rejectRole,
    feedbackText,
    cycleIndex,
    turnCount,
    roster,
    null,
  ).newIssues;
}

export function createReviewIssueBaseline(
  issues: readonly ReviewIssue[],
): ReviewIssueBaseline {
  return { issueIds: new Set(issues.map((issue) => issue.id)) };
}

export function createReviewIssuesWithinBaseline(
  params: BaselineIssueCreationParams,
): BaselineIssueCreationResult {
  return createReviewIssuesInternal(
    params.existingIssues,
    params.rejectRole,
    params.feedbackText,
    params.cycleIndex,
    params.turnCount,
    params.roster,
    params.baseline,
  );
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
    if (issue.status === "open") {
      issue.lastAttemptedOnTurn = turnCount;
    }
  }
}

export function markIssuesFailedValidation(
  issues: ReviewIssue[],
  targetRole: SimulationAgentRole,
): void {
  void issues;
  void targetRole;
}

export function markIssuesAddressed(issues: ReviewIssue[]): void {
  for (const issue of issues) {
    if (issue.status === "open") {
      issue.status = "addressed";
    }
  }
}

function normalizeAcceptedRiskReason(reason: string): string {
  const normalized = reason.trim();
  if (normalized.length === 0) {
    throw new Error("Accepted risk disposition requires a reason.");
  }
  return normalized;
}

export function markIssuesAcceptedRisk(
  issues: ReviewIssue[],
  disposition: IssueAcceptedRisk,
): void {
  const reason = normalizeAcceptedRiskReason(disposition.reason);
  const acceptedRisk: IssueAcceptedRisk = { ...disposition, reason };

  for (const issue of issues) {
    if (issue.status !== "open") {
      continue;
    }
    issue.status = "accepted_risk";
    issue.acceptedRisk = acceptedRisk;
  }
}

export function buildIssueSnapshot(issues: ReviewIssue[]): ReviewIssueSnapshot {
  return {
    issues,
    totalCreated: issues.length,
    totalOpen: issues.filter((issue) => issue.status === "open").length,
    totalAddressed: issues.filter((issue) => issue.status === "addressed").length,
    totalAcceptedRisk: issues.filter((issue) => issue.status === "accepted_risk")
      .length,
  };
}
